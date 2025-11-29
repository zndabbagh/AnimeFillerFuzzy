const cron = require('node-cron');
const { scrapeAll } = require('./scraper');

// Run scraper every Sunday at 3 AM
// Cron format: minute hour day month day-of-week
// '0 3 * * 0' = At 3:00 AM on Sunday

console.log('📅 Scheduler initialized');
console.log('⏰ Will scrape AnimeFillerList every Sunday at 3:00 AM');

// Run immediately on startup if filler-data.json doesn't exist
const fs = require('fs');
if (!fs.existsSync('filler-data.json')) {
    console.log('No filler-data.json found, running initial scrape...');
    scrapeAll().catch(console.error);
}

// Schedule weekly scraping
cron.schedule('0 3 * * 0', async () => {
    console.log('\n🕐 Running scheduled scrape...');
    try {
        await scrapeAll();
        console.log('✅ Scheduled scrape completed successfully\n');
    } catch (error) {
        console.error('❌ Scheduled scrape failed:', error);
    }
});

// Keep the process running
setInterval(() => {
    const now = new Date();
    console.log(`Scheduler alive - ${now.toLocaleString()}`);
}, 3600000); // Log every hour

module.exports = {};
