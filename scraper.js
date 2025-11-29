const https = require('https');
const fs = require('fs').promises;

// Scrape AnimeFillerList.com for all anime filler data
async function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseFillerEpisodes(html) {
    const filler = [];
    const mixed = [];
    
    // NEW: More robust parsing for filler episodes
    // Look for the filler episodes section more carefully
    const fillerRegex = /<div[^>]*>\s*Filler Episodes?:\s*([\d\s,\-]+)/i;
    const mixedRegex = /<div[^>]*>\s*Mixed Canon\/Filler Episodes?:\s*([\d\s,\-]+)/i;
    
    const fillerMatch = html.match(fillerRegex);
    const mixedMatch = html.match(mixedRegex);
    
    if (fillerMatch) {
        const episodeText = fillerMatch[1];
        const episodes = parseEpisodeRanges(episodeText);
        filler.push(...episodes);
        console.log(`  Found ${episodes.length} filler episodes`);
    }
    
    if (mixedMatch) {
        const episodeText = mixedMatch[1];
        const episodes = parseEpisodeRanges(episodeText);
        mixed.push(...episodes);
        console.log(`  Found ${episodes.length} mixed episodes`);
    }
    
    return { filler, mixed };
}

function parseEpisodeRanges(text) {
    const episodes = [];
    // Clean up the text - remove any HTML tags and extra whitespace
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    const ranges = cleanText.match(/\d+(?:-\d+)?/g) || [];
    
    for (const range of ranges) {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(Number);
            for (let i = start; i <= end; i++) {
                episodes.push(i);
            }
        } else {
            episodes.push(Number(range));
        }
    }
    
    return episodes;
}

async function getAnimeList() {
    console.log('Fetching anime list from AnimeFillerList...');
    const html = await fetchPage('https://www.animefillerlist.com/shows');
    
    // Extract all anime show links
    const animeLinks = [];
    const linkRegex = /<a href="\/shows\/([^"]+)">([^<]+)<\/a>/g;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
        animeLinks.push({
            slug: match[1],
            name: match[2]
        });
    }
    
    console.log(`Found ${animeLinks.length} anime shows`);
    return animeLinks;
}

async function scrapeAnime(slug, name) {
    try {
        console.log(`Scraping ${name}...`);
        const html = await fetchPage(`https://www.animefillerlist.com/shows/${slug}`);
        const fillerData = parseFillerEpisodes(html);
        
        // Normalize the name for use as a key
        const key = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        return {
            key,
            name,
            slug,
            ...fillerData
        };
    } catch (error) {
        console.error(`Error scraping ${name}:`, error.message);
        return null;
    }
}

async function scrapeAll() {
    console.log('Starting AnimeFillerList scraper...');
    
    const animeList = await getAnimeList();
    const fillerDatabase = {};
    
    // Scrape in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < animeList.length; i += batchSize) {
        const batch = animeList.slice(i, i + batchSize);
        const results = await Promise.all(
            batch.map(anime => scrapeAnime(anime.slug, anime.name))
        );
        
        for (const result of results) {
            if (result) {
                fillerDatabase[result.key] = {
                    name: result.name,
                    filler: result.filler,
                    mixed: result.mixed
                };
            }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`Progress: ${Math.min(i + batchSize, animeList.length)}/${animeList.length}`);
    }
    
    // Save to file
    await fs.writeFile(
        'filler-data.json',
        JSON.stringify(fillerDatabase, null, 2)
    );
    
    console.log(`Scraping complete! Saved ${Object.keys(fillerDatabase).length} anime to filler-data.json`);
    return fillerDatabase;
}

// Run if called directly
if (require.main === module) {
    scrapeAll().catch(console.error);
}

module.exports = { scrapeAll };
