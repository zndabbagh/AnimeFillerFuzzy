const fs = require('fs').promises;

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

// Normalize anime name for comparison
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate similarity score (0-1, higher is better)
function similarity(a, b) {
    const normA = normalizeName(a);
    const normB = normalizeName(b);
    
    if (normA === normB) return 1.0;
    
    const maxLen = Math.max(normA.length, normB.length);
    const distance = levenshtein(normA, normB);
    
    return 1 - (distance / maxLen);
}

// Find best matching anime from filler database
async function findBestMatch(animeName, fillerDatabase) {
    let bestMatch = null;
    let bestScore = 0;
    const threshold = 0.7; // Minimum similarity score
    
    // Try exact match first
    for (const [key, data] of Object.entries(fillerDatabase)) {
        if (normalizeName(data.name) === normalizeName(animeName)) {
            return { key, score: 1.0, name: data.name };
        }
    }
    
    // Fuzzy match
    for (const [key, data] of Object.entries(fillerDatabase)) {
        const score = similarity(animeName, data.name);
        
        if (score > bestScore && score >= threshold) {
            bestScore = score;
            bestMatch = { key, score, name: data.name };
        }
    }
    
    return bestMatch;
}

// Load ID cache from file
async function loadIdCache() {
    try {
        const data = await fs.readFile('id-cache.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Save ID cache to file
async function saveIdCache(cache) {
    await fs.writeFile('id-cache.json', JSON.stringify(cache, null, 2));
}

// Get or create mapping for IMDB ID
async function getAnimeMapping(imdbId, animeName, fillerDatabase) {
    const cache = await loadIdCache();
    
    // Check cache first
    if (cache[imdbId]) {
        console.log(`Cache hit for ${imdbId}: ${cache[imdbId]}`);
        return cache[imdbId];
    }
    
    // Find best match
    const match = await findBestMatch(animeName, fillerDatabase);
    
    if (match) {
        console.log(`Matched "${animeName}" to "${match.name}" (score: ${match.score.toFixed(2)})`);
        
        // Save to cache
        cache[imdbId] = match.key;
        await saveIdCache(cache);
        
        return match.key;
    }
    
    console.log(`No match found for "${animeName}"`);
    return null;
}

module.exports = {
    findBestMatch,
    getAnimeMapping,
    similarity,
    normalizeName
};
