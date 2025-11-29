const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');
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
let isScraperRunning = false;

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
        },
        'bleach': {
            name: 'Bleach',
            filler: [33, 50, 64, 65, 66, 67, 68, 69, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 355],
            mixed: []
        }
    };
}

// Get filler status for an episode
async function getFillerStatus(imdbId, season, episode) {
    try {
        const animeInfo = await getAnimeName(imdbId);
        if (!animeInfo) {
            console.log(`Could not find anime info for ${imdbId}`);
            return null;
        }
        
        console.log(`Anime: ${animeInfo.name}`);
        
        const animeKey = await getAnimeMapping(imdbId, animeInfo.name, fillerDatabase);
        if (!animeKey || !fillerDatabase[animeKey]) {
            console.log(`No filler data found for ${animeInfo.name}`);
            return null;
        }
        
        const absoluteEpisode = await getAbsoluteEpisode(imdbId, season, episode);
        if (!absoluteEpisode) {
            console.log(`Could not calculate absolute episode for S${season}E${episode}`);
            return null;
        }
        
        const animeData = fillerDatabase[animeKey];
        
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
    const interface = builder.getInterface();
    
    // Create custom express app
    const app = express();
    
    const landingHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Anime Filler Info</title>
            <style>
                body { font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px; }
                h1 { color: #333; }
                .button { 
                    display: inline-block;
                    padding: 15px 30px;
                    background: #4CAF50;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 10px 5px;
                }
                .button:hover { background: #45a049; }
                .warning { background: #ff9800; }
                .info { background: #2196F3; }
                .status { 
                    padding: 20px;
                    background: #f0f0f0;
                    border-radius: 5px;
                    margin: 20px 0;
                }
            </style>
        </head>
        <body>
            <h1>🎬 Anime Filler Info Addon</h1>
            <div class="status">
                <h3>Current Status:</h3>
                <p>📊 Anime in database: ${Object.keys(fillerDatabase).length}</p>
                <p>🔄 Scraper status: ${isScraperRunning ? 'Running...' : 'Idle'}</p>
            </div>
            
            <h3>Quick Actions:</h3>
            <a href="/trigger-scrape" class="button warning">🔄 Trigger Manual Scrape</a>
            <a href="/manifest.json" class="button info">📄 View Manifest</a>
            
            <h3>Install in Stremio:</h3>
            <p>Copy this URL and paste it in Stremio's "Install from URL":</p>
            <code style="background: #f0f0f0; padding: 10px; display: block;">${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port}/manifest.json</code>
            
            <h3>How It Works:</h3>
            <p>This addon automatically detects filler episodes in anime using data from AnimeFillerList.com</p>
            <p>The scraper runs automatically every Sunday at 3 AM, or trigger it manually by redeploying with "scrape-and-start" command.</p>
            
            <p style="margin-top: 40px; color: #999;">Scraping takes 10-15 minutes on first run.</p>
        </body>
        </html>
    `;
    
    // Landing page
    app.get('/', (req, res) => {
        res.send(landingHTML);
    });
    
    // Trigger scraper endpoint
    app.get('/trigger-scrape', async (req, res) => {
        if (isScraperRunning) {
            res.send(`
                <html>
                <head><title>Scraper Running</title></head>
                <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
                    <h2>⚠️ Scraper Already Running</h2>
                    <p>The scraper is already in progress. Please wait for it to complete.</p>
                    <a href="/" style="color: #2196F3;">← Back to Home</a>
                </body>
                </html>
            `);
            return;
        }
        
        res.send(`
            <html>
            <head><title>Scrape Started</title></head>
            <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
                <h2>✅ Scraping Started!</h2>
                <p>The scraper is now running in the background.</p>
                <p>This will take approximately <strong>10-15 minutes</strong>.</p>
                <p>Check the Render logs to see progress.</p>
                <a href="/" style="color: #2196F3;">← Back to Home</a>
            </body>
            </html>
        `);
        
        // Run scraper in background
        setTimeout(async () => {
            isScraperRunning = true;
            try {
                console.log('\n🔄 Manual scrape triggered via web endpoint...\n');
                const { scrapeAll } = require('./scraper');
                await scrapeAll();
                
                await loadFillerDatabase();
                
                console.log('\n✅ Manual scrape completed successfully!\n');
                isScraperRunning = false;
            } catch (error) {
                console.error('\n❌ Manual scrape failed:', error);
                isScraperRunning = false;
            }
        }, 1000);
    });
    
    // Use the addon server from SDK
    serveHTTP(interface, { 
        port,
        getRouter: () => app
    });
    
    console.log(`\n🎬 Anime Filler Info addon running on port ${port}`);
    console.log(`📊 Loaded filler data for ${Object.keys(fillerDatabase).length} anime`);
    console.log(`🌐 Access at: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port}`);
    console.log(`🔄 Trigger scraper at: ${process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + port}/trigger-scrape\n`);
}

start().catch(console.error);
