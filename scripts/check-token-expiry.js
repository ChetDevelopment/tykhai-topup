const jwt = require('jsonwebtoken');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3MzcyNzY1MzYsImV4cCI6MTc0NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY';

try {
  const decoded = jwt.decode(token, { complete: true });
  console.log('JWT Payload:', JSON.stringify(decoded.payload, null, 2));
  
  const iat = decoded.payload.iat * 1000; // Convert to milliseconds
  const exp = decoded.payload.exp * 1000;
  
  console.log('\nToken issued at:', new Date(iat).toISOString());
  console.log('Token expires at:', new Date(exp).toISOString());
  
  const now = Date.now();
  if (now > exp) {
    console.log('\n✗ TOKEN IS EXPIRED!');
    console.log('Expired on:', new Date(exp).toLocaleDateString());
    console.log('Days since expiration:', Math.floor((now - exp) / (1000 * 60 * 60 * 24)));
  } else {
    console.log('\n✓ Token is still valid');
    console.log('Days until expiration:', Math.floor((exp - now) / (1000 * 60 * 60 * 24)));
  }
} catch (err) {
  console.error('Error decoding token:', err.message);
}
