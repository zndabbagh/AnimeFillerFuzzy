const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs').promises;
const { getAbsoluteEpisode, getAnimeName } = require('./episode-mapper');
const { getAnimeMapping } = require('./anime-matcher');

const manifest = {
    id: 'org.animefiller',
    version: '2.0.0',
    name: 'Anime Filler Info',
    description: 'Automatically detects and marks filler episodes for any anime',
    resources: ['stream'],
    types: ['series'],
    catalogs: [],
    idPrefixes: ['tt', 'kitsu']
};

const builder = new addonBuilder(manifest);

let fillerDatabase = {};

// Load filler database on startup
async function loadFillerDatabase() {
    try {
        const data = await fs.readFile('filler-data.json', 'utf8');
        fillerDatabase = JSON.parse(data);
        console.log(`Loaded filler data for ${Object.keys(fillerDatabase).length} anime`);
    } catch (error) {
        console.error('Could not load filler-data.json:', error.message);
        console.log('Using fallback data for popular anime...');
        fillerDatabase = getFallbackData();
    }
}

// Fallback data for popular anime if scraper hasn't run yet
function getFallbackData() {
    return {
        'naruto': {
            name: 'Naruto',
            filler: [26, 97, 101, 102, 103, 104, 105, 106, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220],
            mixed: [27, 185, 189]
        },
        'detective-conan': {
            name: 'Detective Conan',
            filler: [6,14,17,19,21,24,25,26,29,30,33,36,37,41,44,45,47,51,53,55,56,59,61,62,64,65,66,67,71,73,74,79,80,83,87,88,89,90,92,93,94,95,97,106,107,108,109,110,111,119,120,123,124,125,126,127,135,140,143,148,149,150,151,152,155,158,159,160,161,165,169,175,179,180,181,182,183,184,185,186,187,196,197,198,201,202,203,204,207,208,209,210,211,214,215,216,225,232,235,236,237,245,248,251,252,255,256,257,260,261,262,264,265,273,276,281,282,283],
            mixed: []
        }
    };
}

// Get filler status for an episode
async function getFillerStatus(imdbId, season, episode) {
    try {
        // Get anime name from IMDB ID
        const animeInfo = await getAnimeName(imdbId);
        if (!animeInfo) {
            console.log(`Could not find anime info for ${imdbId}`);
            return null;
        }
        
        console.log(`Anime: ${animeInfo.name}`);
        
        // Find matching anime in filler database
        const animeKey = await getAnimeMapping(imdbId, animeInfo.name, fillerDatabase);
        if (!animeKey || !fillerDatabase[animeKey]) {
            console.log(`No filler data found for ${animeInfo.name}`);
            return null;
        }
        
        // Get absolute episode number
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        if (!absoluteEpisode) {
            console.log(`Could not calculate absolute episode for S${season}E${episode}`);
            return null;
        }
        
        const animeData = fillerDatabase[animeKey];
        
        // Check filler status
        if (animeData.filler && animeData.filler.includes(absoluteEpisode)) {
            return 'filler';
        } else if (animeData.mixed && animeData.mixed.includes(absoluteEpisode)) {
            return 'mixed';
        } else {
            return 'canon';
        }
        
    } catch (error) {
        console.error('Error getting filler status:', error);
        return null;
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n=== Stream Request ===`);
    console.log(`Type: ${type}, ID: ${id}`);
    
    if (type !== 'series') {
        return { streams: [] };
    }
    
    const parts = id.split(':');
    if (parts.length < 3) {
        return { streams: [] };
    }
    
    const seriesId = parts[0];
    const season = parseInt(parts[1]);
    const episode = parseInt(parts[2]);
    
    console.log(`Parsed: ${seriesId} S${season}E${episode}`);
    
    const status = await getFillerStatus(seriesId, season, episode);
    
    let streamName = 'Anime Filler Info';
    let streamTitle = '';
    
    if (!status) {
        console.log('No filler data available');
        streamTitle = 'ℹ️ NO DATA AVAILABLE\nFiller info not found for this anime';
    } else if (status === 'filler') {
        streamTitle = '🚫 FILLER EPISODE\nNot canon - Safe to skip';
    } else if (status === 'mixed') {
        streamTitle = '⚡ MIXED CONTENT\nPartial canon content';
    } else {
        streamTitle = '✅ CANON EPISODE\nMain storyline';
    }
    
    console.log(`Result: ${status ? status.toUpperCase() : 'NO DATA'}`);
    console.log('===================\n');
    
    return { 
        streams: [{
            name: streamName,
            title: streamTitle,
            externalUrl: 'https://www.animefillerlist.com'
        }]
    };
});

// Initialize and start server
async function start() {
    await loadFillerDatabase();
    
    const port = process.env.PORT || 7000;
    serveHTTP(builder.getInterface(), { port });
    console.log(`\n🎬 Anime Filler Info addon running on port ${port}`);
    console.log(`📊 Loaded filler data for ${Object.keys(fillerDatabase).length} anime\n`);
}

start().catch(console.error);
