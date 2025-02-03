const axios = require('axios');
const cheerio = require('cheerio');
const { PromisePool } = require('@supercharge/promise-pool');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  TARGET_URL: 'https://www.coupons.com/coupon-codes/aliexpress',
  API_BASE: 'https://www.coupons.com/api/voucher/country/us/client/15943717d76a8bf7eb0d5b8ad2ea2e55/id',
  OUTPUT_FILE: path.join('docs', 'coupons.json'),
  CONCURRENCY: 5,
  RETRIES: 2,
  REQUEST_TIMEOUT: 5000
};

async function fetchCoupon(id) {
    const url = `${CONFIG.API_BASE}/${id}`;
    
    for (let attempt = 1; attempt <= CONFIG.RETRIES; attempt++) {
    try {
        const { data } = await axios.get(url, { timeout: CONFIG.REQUEST_TIMEOUT });
        return {
        title: data.title,
        type: data.type,
        isVerified: data.isVerified,
        code: data.code || null
        };
    } catch (error) {
        if (attempt === CONFIG.RETRIES) {
        console.error(`Failed ${id} after ${CONFIG.RETRIES} attempts`);
        return null;
        }
    }
    }
}

async function scrapeCoupons() {
    try {
    const { data: html } = await axios.get(CONFIG.TARGET_URL);
    const $ = cheerio.load(html);
    const ids = [...new Set(
        $('[data-id]')
        .map((i, el) => [$(el).attr('data-id'), $(el).attr('data-old-id')])
        .get()
        .filter(Boolean)
    )];

    console.log(`Found ${ids.length} unique coupon IDs`);

    const { results } = await PromisePool
        .withConcurrency(CONFIG.CONCURRENCY)
        .for(ids)
        .process(async (id) => {
        try {
            return await fetchCoupon(id);
        } catch (error) {
            console.error(`Error processing ${id}: ${error.message}`);
            return null;
        }
        });

    const validResults = results.filter(Boolean);
    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(validResults, null, 2));
    console.log(`Saved ${validResults.length} valid coupons to ${CONFIG.OUTPUT_FILE}`);

    } catch (error) {
    console.error('Scraping failed:', error.message);
    }
}

scrapeCoupons();

