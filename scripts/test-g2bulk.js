const https = require('https');

const options = {
  hostname: 'api.g2bulk.com',
  port: 443,
  path: '/v1/getMe',
  method: 'GET',
  headers: {
    'X-API-Key': '07fffdc4807e96f07736ef0c9f40954bcff0ae96ed84d9cf0f8ba6869231f9b2'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    try {
      const json = JSON.parse(data);
      if (json.success) {
        console.log('\n✓ G2Bulk Connection Successful!');
        console.log('Balance: $' + json.balance);
        console.log('User ID:', json.user_id);
        console.log('Username:', json.username);
      } else {
        console.log('\n✗ G2Bulk Connection Failed');
        console.log('Error:', json.message);
      }
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.log('Request error:', e.message);
});

req.end();
