// scripts/get-gamedrop-offers.js
// Use Node.js to call GameDrop API

const https = require('https');
const token = process.env.GAMEDROP_TOKEN || "HhjQkBmsIkKPTcnw6RLN2vPjNEPMqRWOgr4MMEXTcGJas";

const options = {
  hostname: 'partner.gamesdrop.io',
  path: '/api/v1/offers/list',
  method: 'GET',
  headers: {
    'Authorization': token,
    'Content-Type': 'application/json'
  }
};

console.log("Fetching GameDrop offers...\n");

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => { data += chunk; });
  
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`Error: ${res.statusCode}`);
      console.error('Response:', data);
      process.exit(1);
    }
    
    try {
      const json = JSON.parse(data);
      console.log("=== GameDrop Offers ===\n");
      
      if (Array.isArray(json)) {
        json.forEach((offer, idx) => {
          console.log(`${idx + 1}. ${offer.offerName || offer.name || 'Unknown'}`);
          console.log(`   ID: ${offer.offerId || offer.id || 'N/A'}`);
          console.log(`   Product: ${offer.productName || offer.product || 'N/A'}`);
          console.log(`   Price: ${offer.price || 'N/A'} ${offer.currency || ''}`);
          console.log('');
        });
      } else {
        console.log("Response:", JSON.stringify(json, null, 2));
      }
      
      console.log("\n=== SQL to Update Database ===");
      if (Array.isArray(json)) {
        json.forEach(offer => {
          const id = offer.offerId || offer.id;
          const name = offer.offerName || offer.name || 'Unknown';
          console.log(`UPDATE "Product" SET "gameDropOfferId" = ${id} WHERE "name" = '${name}';`);
        });
      }
      
    } catch (e) {
      console.error("Failed to parse JSON:", e.message);
      console.log("Raw response:", data);
    }
  });
});

req.on('error', (e) => {
  console.error("Request failed:", e.message);
  process.exit(1);
});

req.end();
