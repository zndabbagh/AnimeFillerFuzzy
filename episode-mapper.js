const https = require('https');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const cache = new Map();

// Fetch data from TMDB API
async function tmdbFetch(path) {
    return new Promise((resolve, reject) => {
        const url = `https://api.themoviedb.org/3${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Fetch data from Kitsu API
async function kitsuFetch(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'kitsu.io',
            path: `/api/edge${path}`,
            headers: {
                'Accept': 'application/vnd.api+json',
                'Content-Type': 'application/vnd.api+json'
            }
        };
        
        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Get anime info from Kitsu ID
async function kitsuToAnime(kitsuId) {
    const cacheKey = `kitsu_${kitsuId}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    try {
        const data = await kitsuFetch(`/anime/${kitsuId}`);
        const anime = data.data;
        
        if (anime) {
            const result = {
                name: anime.attributes.canonicalTitle,
                originalName: anime.attributes.titles?.en_jp || anime.attributes.titles?.ja_jp,
                episodeCount: anime.attributes.episodeCount,
                kitsuId: kitsuId
            };
            cache.set(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error(`Error fetching Kitsu data for ${kitsuId}:`, error.message);
    }
    
    return null;
}

// Convert IMDB ID to TMDB ID
async function imdbToTmdb(imdbId) {
    const cacheKey = `imdb_${imdbId}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    try {
        const data = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id`);
        const tvShow = data.tv_results?.[0];
        
        if (tvShow) {
            cache.set(cacheKey, tvShow);
            return tvShow;
        }
    } catch (error) {
        console.error(`Error finding TMDB data for ${imdbId}:`, error.message);
    }
    
    return null;
}

// Get season details from TMDB
async function getSeasonDetails(tmdbId, seasonNumber) {
    const cacheKey = `season_${tmdbId}_${seasonNumber}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    try {
        const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`);
        cache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`Error fetching season ${seasonNumber} for TMDB ${tmdbId}:`, error.message);
        return null;
    }
}

// Calculate absolute episode number
async function getAbsoluteEpisode(id, season, episode) {
    // Handle Kitsu IDs differently - they use absolute numbering already
    if (id.startsWith('kitsu:')) {
        // Kitsu format is kitsu:ID:episode
        return episode;
    }
    
    const tvShow = await imdbToTmdb(id);
    if (!tvShow) {
        console.log(`Could not find TMDB data for ${id}`);
        return null;
    }
    
    let absoluteEpisode = 0;
    
    // Sum up all episodes from previous seasons
    for (let s = 1; s < season; s++) {
        const seasonData = await getSeasonDetails(tvShow.id, s);
        if (seasonData && seasonData.episodes) {
            absoluteEpisode += seasonData.episodes.length;
        }
    }
    
    // Add current episode number
    absoluteEpisode += episode;
    
    console.log(`${id} S${season}E${episode} = Absolute Episode ${absoluteEpisode}`);
    return absoluteEpisode;
}

// Get anime name from ID (IMDB or Kitsu)
async function getAnimeName(id) {
    // Handle Kitsu IDs
    if (id.startsWith('kitsu:')) {
        const kitsuId = id.split(':')[1];
        const anime = await kitsuToAnime(kitsuId);
        if (!anime) {
            return null;
        }
        return {
            name: anime.name,
            originalName: anime.originalName,
            kitsuId: kitsuId
        };
    }
    
    // Handle IMDB IDs
    const tvShow = await imdbToTmdb(id);
    if (!tvShow) {
        return null;
    }
    
    return {
        name: tvShow.name,
        originalName: tvShow.original_name,
        tmdbId: tvShow.id
    };
}

module.exports = {
    getAbsoluteEpisode,
    getAnimeName,
    imdbToTmdb,
    kitsuToAnime
};
