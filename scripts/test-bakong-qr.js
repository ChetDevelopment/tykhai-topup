const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const BAKONG_ACCOUNT = 'vichet_sat@bkrt';
const BAKONG_MERCHANT_NAME = 'Ty Khai TopUp';
const BAKONG_MERCHANT_CITY = 'Phnom Penh';

console.log('Testing Bakong KHQR generation with official library...\n');

const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
const billNumber = 'TY' + Date.now();

const optionalData = {
  currency: khqrData.currency.usd,
  amount: 1.00,
  billNumber: billNumber,
  expirationTimestamp: expiresAt.getTime(),
};

const individualInfo = new IndividualInfo(
  BAKONG_ACCOUNT,
  BAKONG_MERCHANT_NAME,
  BAKONG_MERCHANT_CITY,
  optionalData
);

const khqr = new BakongKHQR();
const response = khqr.generateIndividual(individualInfo);

if (response.status?.errorCode) {
  console.log('ERROR:', response.status.message);
  process.exit(1);
}

console.log('Bill Number:', billNumber);
console.log('Amount: $1.00 USD');
console.log('QR String:', response.data.qr);
console.log('QR Length:', response.data.qr.length);
console.log('MD5 Hash:', response.data.md5);
console.log('Expires At:', expiresAt.toISOString());

const hasExpiration = response.data.qr.includes('0113');
console.log('\nHas expiration timestamp:', hasExpiration ? 'YES (FIXED)' : 'NO (BROKEN)');

console.log('\nQR generation successful!');
