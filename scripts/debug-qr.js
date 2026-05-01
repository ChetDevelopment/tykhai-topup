const { KHQR } = require('bakong-khqr-npm');
const crypto = require('crypto');

const BAKONG_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3MzcyNzY1MzYsImV4cCI6MTc0NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY';
const BAKONG_ACCOUNT = 'vichet_sat@bkrt';
const BAKONG_MERCHANT_NAME = 'Ty Khai TopUp';
const BAKONG_MERCHANT_CITY = 'Phnom Penh';

console.log('Debugging Bakong QR Generation...\n');

try {
  const khqr = new KHQR(BAKONG_TOKEN);
  
  // Test 1: Generate QR with short ref
  const shortRef = 'TY' + Date.now().toString().slice(-8);
  console.log('Test 1: Short reference');
  console.log('Ref:', shortRef);
  
  const qr1 = khqr.create_qr({
    bank_account: BAKONG_ACCOUNT,
    merchant_name: BAKONG_MERCHANT_NAME,
    merchant_city: BAKONG_MERCHANT_CITY,
    amount: 1.00,
    currency: 'USD',
    bill_number: shortRef,
    static: false,
  });
  
  const md5_1 = khqr.generate_md5(qr1);
  console.log('QR length:', qr1.length);
  console.log('MD5:', md5_1);
  console.log('First 100 chars:', qr1.substring(0, 100) + '...\n');
  
  // Test 2: Check if QR is registered by verifying immediately
  console.log('Test 2: Check if QR is registered...');
  khqr.get_payment(md5_1)
    .then(data => {
      if (data) {
        console.log('Payment found (unexpected):', data);
      } else {
        console.log('No payment yet (expected for new QR)\n');
      }
      
      // Test 3: Try with different bill number format
      console.log('Test 3: Different bill number format...');
      const ref2 = 'ORDER' + Date.now();
      const qr2 = khqr.create_qr({
        bank_account: BAKONG_ACCOUNT,
        merchant_name: BAKONG_MERCHANT_NAME,
        merchant_city: BAKONG_MERCHANT_CITY,
        amount: 1.00,
        currency: 'USD',
        bill_number: ref2,
        static: false,
      });
      
      const md5_2 = khqr.generate_md5(qr2);
      console.log('Ref2:', ref2);
      console.log('MD5_2:', md5_2);
      console.log('\n✓ Both QR generation methods work');
      console.log('\nPossible issues with "expired" error:');
      console.log('1. Bakong app has clock sync issue (try syncing phone time)');
      console.log('2. QR code not being registered properly with Bakong API');
      console.log('3. Try using the Bakong app to scan QR within 1-2 minutes of generation');
      console.log('4. Make sure you are using the Bakong app (not other banking apps)');
    })
    .catch(err => {
      console.error('Verification error:', err.message);
    });
  
} catch (err) {
  console.error('Error:', err.message);
  console.error('\nThis means:');
  console.error('1. Token is invalid or expired');
  console.error('2. Account not verified');
  console.error('3. Network issue connecting to Bakong API');
}
