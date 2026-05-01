const https = require('https');

const options = {
  hostname: 'api.g2bulk.com',
  port: 443,
  path: '/v1/games/freefire_sgmy/catalogue',
  method: 'GET',
  headers: {
    'X-API-Key': '07fffdc4807e96f07736ef0c9f40954bcff0ae96ed84d9cf0f8ba6869231f9b2'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.success) {
        console.log('Free Fire SGMY Catalogue:');
        console.log('========================\n');
        json.catalogues.forEach(item => {
          console.log(`Name: "${item.name}" | Amount: $${item.amount} | ID: ${item.id}`);
        });
        console.log('\n========================');
        console.log('\nSQL to update products:');
        console.log('---\n');
        json.catalogues.forEach(item => {
          console.log(`UPDATE "Product" SET "g2bulkCatalogueName" = '${item.name}' WHERE name LIKE '%${item.name}%' AND "gameId" = (SELECT id FROM "Game" WHERE slug = 'free-fire');`);
        });
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
});

req.end();
