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
async function getAbsoluteEpisode(imdbId, season, episode) {
    const tvShow = await imdbToTmdb(imdbId);
    if (!tvShow) {
        console.log(`Could not find TMDB data for ${imdbId}`);
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
    
    console.log(`${imdbId} S${season}E${episode} = Absolute Episode ${absoluteEpisode}`);
    return absoluteEpisode;
}

// Get anime name from IMDB ID
async function getAnimeName(imdbId) {
    const tvShow = await imdbToTmdb(imdbId);
    if (!tvShow) {
        return null;
    }
    
    return {
        name: tvShow.name,
        originalName: tvShow.original_name,
        tmdbId: tvShow.id
    };
}

// For anime, try to get the absolute episode number directly from episode data
async function getEpisodeAbsoluteNumber(tmdbId, season, episode) {
    const seasonData = await getSeasonDetails(tmdbId, season);
    if (!seasonData || !seasonData.episodes) {
        return null;
    }
    
    const episodeData = seasonData.episodes.find(ep => ep.episode_number === episode);
    
    // Some anime have absolute_episode_number in the data
    if (episodeData && episodeData.absolute_episode_number) {
        return episodeData.absolute_episode_number;
    }
    
    return null;
}

module.exports = {
    getAbsoluteEpisode,
    getAnimeName,
    getEpisodeAbsoluteNumber,
    imdbToTmdb
};
