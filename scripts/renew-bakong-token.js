const https = require('https');

// Use the email you registered with Bakong
const EMAIL = 'ka383768@gmail.com'; // Your registered email

const postData = JSON.stringify({ email: EMAIL });

const options = {
  hostname: 'api-bakong.nbc.gov.kh',
  port: 443,
  path: '/renew_token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Renewing Bakong token for:', EMAIL, '\n');

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data, '\n');
    
    try {
      const json = JSON.parse(data);
      if (json.token) {
        console.log('✓ New token received!');
        console.log('New token:', json.token);
        console.log('\nUpdate your .env.production file:');
        console.log('BAKONG_TOKEN=' + json.token);
      } else if (json.responseCode === 1) {
        console.log('✗ Error:', json.responseMessage);
        console.log('Your email might not be registered.');
        console.log('\nPlease visit: https://api-bakong.nbc.gov.kh/register');
        console.log('to register your email and get a new token.');
      } else {
        console.log('Response:', json);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(postData);
req.end();
