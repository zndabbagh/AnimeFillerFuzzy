const https = require('https');
const fs = require('fs').promises;

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
    
    // Look for episode tables in the HTML
    // AnimeFillerList uses specific formatting - look for the exact text
    const lines = html.split('\n');
    
    let inFillerSection = false;
    let inMixedSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for section headers
        if (line.includes('Filler Episodes') && !line.includes('Mixed')) {
            inFillerSection = true;
            inMixedSection = false;
            // Get the episode numbers from this line or next few lines
            const episodeText = extractEpisodes(lines, i);
            if (episodeText) {
                filler.push(...parseEpisodeRanges(episodeText));
            }
        } else if (line.includes('Mixed Canon/Filler Episodes')) {
            inMixedSection = true;
            inFillerSection = false;
            // Get the episode numbers from this line or next few lines
            const episodeText = extractEpisodes(lines, i);
            if (episodeText) {
                mixed.push(...parseEpisodeRanges(episodeText));
            }
        }
    }
    
    console.log(`  Found ${filler.length} filler episodes, ${mixed.length} mixed episodes`);
    return { filler, mixed };
}

function extractEpisodes(lines, startIndex) {
    // Look at the current line and next 3 lines for episode numbers
    let episodeText = '';
    for (let i = 0; i < 4 && (startIndex + i) < lines.length; i++) {
        episodeText += ' ' + lines[startIndex + i];
    }
    
    // Remove HTML tags
    episodeText = episodeText.replace(/<[^>]*>/g, ' ');
    
    // Find the part with episode numbers (after the colon)
    const colonIndex = episodeText.indexOf(':');
    if (colonIndex !== -1) {
        episodeText = episodeText.substring(colonIndex + 1);
    }
    
    return episodeText;
}

function parseEpisodeRanges(text) {
    const episodes = [];
    // Match patterns like "1-5", "10", "20-25"
    const ranges = text.match(/\d+(?:-\d+)?/g) || [];
    
    for (const range of ranges) {
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    if (!episodes.includes(i)) {
                        episodes.push(i);
                    }
                }
            }
        } else {
            const num = Number(range);
            if (!isNaN(num) && !episodes.includes(num)) {
                episodes.push(num);
            }
        }
    }
    
    return episodes.sort((a, b) => a - b);
}

async function getAnimeList() {
    console.log('Fetching anime list from AnimeFillerList...');
    const html = await fetchPage('https://www.animefillerlist.com/shows');
    
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
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`Progress: ${Math.min(i + batchSize, animeList.length)}/${animeList.length}`);
    }
    
    await fs.writeFile(
        'filler-data.json',
        JSON.stringify(fillerDatabase, null, 2)
    );
    
    console.log(`Scraping complete! Saved ${Object.keys(fillerDatabase).length} anime to filler-data.json`);
    return fillerDatabase;
}

if (require.main === module) {
    scrapeAll().catch(console.error);
}

module.exports = { scrapeAll };
