const { scrapeAll } = require('./scraper');

console.log('Starting manual scrape...');
scrapeAll()
    .then(() => {
        console.log('Scrape completed!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Scrape failed:', err);
        process.exit(1);
    });
