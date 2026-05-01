const parts = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3Mzg0OTkyMCwiZXhwIjoxNzQ4NTkwOTIwfQ.8jQZ29JyqXGRNASSgXho0_B-sv4gGOFPmQYq_lsy5Y'.split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

console.log('New Token Payload:');
console.log(JSON.stringify(payload, null, 2));

const iat = payload.iat * 1000;
const exp = payload.exp * 1000;
const now = Date.now();

console.log('\nToken issued at:', new Date(iat).toISOString());
console.log('Token expires at:', new Date(exp).toISOString());
console.log('Current time:', new Date(now).toISOString());

if (now > exp) {
  console.log('\n✗ TOKEN IS STILL EXPIRED!');
  console.log('Expired on:', new Date(exp).toLocaleDateString());
} else {
  console.log('\n✓ Token is VALID!');
  console.log('Days until expiration:', Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
}
