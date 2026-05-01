const { KHQR } = require('bakong-khqr-npm');
const crypto = require('crypto');

const BAKONG_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3MzcyNzY1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY';
const BAKONG_ACOUNT = 'vichet_sat@bkrt';
const BAKONG_MERCHANT_NAME = 'Ty Khai TopUp';
const BAKONG_MERCHANT_CITY = 'Phnom Penh';

console.log('Testing Bakong QR with real credentials...\n');

try {
  const khqr = new KHQR(BAKONG_TOKEN);
  
  const paymentRef = `TY${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const amount = 1.00; // $1 USD test
  
  console.log('Payment Reference:', paymentRef);
  console.log('Amount: $' + amount);
  console.log('Currency: USD\n');
  
  const qrString = khqr.create_qr({
    bank_account: BAKONG_ACOUNT,
    merchant_name: BAKONG_MERCHANT_NAME,
    merchant_city: BAKONG_MERCHANT_CITY,
    amount: amount,
    currency: 'USD',
    bill_number: paymentRef,
    static: false,
  });
  
  console.log('✓ QR String generated successfully!');
  console.log('QR String length:', qrString.length);
  console.log('\nFirst 150 chars:');
  console.log(qrString.substring(0, 150) + '...\n');
  
  const md5String = khqr.generate_md5(qrString);
  console.log('✓ MD5 Hash generated:', md5String);
  console.log('\n✓ QR generation successful!');
  console.log('\nNext steps:');
  console.log('1. Restart your dev server: npm run dev');
  console.log('2. Create a test order at: http://localhost:3000');
  console.log('3. The QR should now work properly in Bakong app');
  
} catch (err) {
  console.error('\n✗ Error:', err.message);
  console.error('\nPossible issues:');
  console.error('1. Token might be expired (valid for 90 days)');
  console.error('2. Account might not be verified');
  console.error('3. Network issues connecting to Bakong API');
  console.error('\nTry renewing token at: https://api-bakong.nbc.gov.kh/renew_token');
}
