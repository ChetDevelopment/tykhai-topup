const { KHQR } = require('bakong-khqr-npm');
const crypto = require('crypto');

// Test Bakong QR generation
const BAKONG_TOKEN = 'your_bakong_token'; // Replace with actual token from .env
const BAKONG_ACCOUNT = 'your_account';
const BAKONG_MERCHANT_NAME = 'TyKhai';
const BAKONG_MERCHANT_CITY = 'PhnomPenh';

if (BAKONG_TOKEN === 'your_bakong_token') {
  console.log('Error: Please update BAKONG_TOKEN in this script with actual token from .env file');
  process.exit(1);
}

try {
  console.log('Testing Bakong QR generation...\n');
  
  const khqr = new KHQR(BAKONG_TOKEN);
  
  const paymentRef = `TY${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const amount = 1.00; // $1 USD test
  
  console.log('Payment Reference:', paymentRef);
  console.log('Amount: $' + amount);
  console.log('Currency: USD\n');
  
  const qrString = khqr.create_qr({
    bank_account: BAKONG_ACCOUNT,
    merchant_name: BAKONG_MERCHANT_NAME,
    merchant_city: BAKONG_MERCHANT_CITY,
    amount: amount,
    currency: 'USD',
    bill_number: paymentRef,
    static: false,
  });
  
  console.log('QR String generated successfully!');
  console.log('QR String length:', qrString.length);
  console.log('\nFirst 100 chars:', qrString.substring(0, 100) + '...\n');
  
  const md5String = khqr.generate_md5(qrString);
  console.log('MD5 Hash:', md5String);
  
  // Test verification
  console.log('\nTesting payment verification...');
  const verifyKhqr = new KHQR(BAKONG_TOKEN);
  verifyKhqr.get_payment(md5String)
    .then(data => {
      if (data) {
        console.log('Payment found:', data);
      } else {
        console.log('No payment found (expected - this is a test QR)');
      }
    })
    .catch(err => {
      console.log('Verification error (expected for test):', err.message);
    });
  
  console.log('\n✓ QR generation works!');
  console.log('Issue might be:');
  console.log('1. BAKONG_TOKEN is invalid or expired');
  console.log('2. QR expires too quickly (15 min is max for dynamic QR)');
  console.log('3. Customer bank app has clock sync issues');
  
} catch (err) {
  console.error('Error:', err.message);
  console.error('\nPossible issues:');
  console.error('1. BAKONG_TOKEN is invalid');
  console.error('2. bakong-khqr-npm library version mismatch');
  console.error('3. Network issues connecting to Bakong API');
}
