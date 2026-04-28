#!/usr/bin/env node

/**
 * Security Testing Tool for Ty Khai TopUp
 * Run: node scripts/security-test.js [target-url]
 * Example: node scripts/security-test.js http://localhost:3000
 * 
 * WARNING: Only use on your own website!
 */

const targetUrl = process.argv[2] || "http://localhost:3000";

console.log(`🔒 Security Testing Tool`);
console.log(`🎯 Target: ${targetUrl}`);
console.log(`⏰ Started: ${new Date().toISOString()}\n`);

const results = {
  pass: 0,
  fail: 0,
  warn: 0,
  tests: []
};

async function test(name, fn) {
  process.stdout.write(`Testing: ${name}... `);
  try {
    const result = await fn();
    if (result.pass) {
      console.log(`✅ PASS`);
      results.pass++;
    } else {
      console.log(`❌ FAIL: ${result.message}`);
      results.fail++;
    }
    results.tests.push({ name, ...result });
  } catch (error) {
    console.log(`⚠️ ERROR: ${error.message}`);
    results.warn++;
    results.tests.push({ name, pass: false, message: error.message });
  }
}

// Helper to make requests
async function fetchUrl(path, options = {}) {
  const url = `${targetUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'SecurityTestTool/1.0',
      ...options.headers
    }
  });
  return response;
}

// 1. Check Security Headers
async function checkSecurityHeaders() {
  const response = await fetchUrl('/');
  const headers = response.headers;
  
  const requiredHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy'
  ];
  
  const missing = requiredHeaders.filter(h => !headers.get(h));
  
  if (missing.length > 0) {
    return { pass: false, message: `Missing headers: ${missing.join(', ')}` };
  }
  
  // Check CSP
  if (!headers.get('content-security-policy')) {
    return { pass: false, message: 'Missing Content-Security-Policy header' };
  }
  
  return { pass: true };
}

// 2. Check for exposed .env files
async function checkEnvExposure() {
  const paths = ['/.env', '/.env.local', '/.env.production', '/.env.example'];
  
  for (const path of paths) {
    const response = await fetchUrl(path);
    if (response.status !== 404 && response.status !== 403) {
      return { pass: false, message: `Exposed: ${path} (status: ${response.status})` };
    }
  }
  
  return { pass: true };
}

// 3. Test Rate Limiting
async function testRateLimiting() {
  const requests = [];
  const numRequests = 20;
  
  // Send multiple requests to an API endpoint
  for (let i = 0; i < numRequests; i++) {
    requests.push(fetchUrl('/api/products'));
  }
  
  const responses = await Promise.all(requests);
  const rateLimited = responses.some(r => r.status === 429);
  
  if (!rateLimited) {
    return { pass: false, message: `No rate limiting detected after ${numRequests} requests` };
  }
  
  return { pass: true };
}

// 4. Check for XSS vulnerabilities in search params
async function testXSSReflection() {
  const xssPayload = '<script>alert("XSS")</script>';
  const response = await fetchUrl(`/?q=${encodeURIComponent(xssPayload)}`);
  const body = await response.text();
  
  if (body.includes(xssPayload)) {
    return { pass: false, message: 'XSS payload reflected in response' };
  }
  
  return { pass: true };
}

// 5. Check if admin panel is accessible without auth
async function checkAdminAuth() {
  const response = await fetchUrl('/admin');
  
  if (response.status === 200) {
    return { pass: false, message: 'Admin panel accessible without authentication' };
  }
  
  if (response.status === 401 || response.status === 403 || response.status === 302) {
    return { pass: true };
  }
  
  return { pass: false, message: `Unexpected status: ${response.status}` };
}

// 6. Test SQL injection patterns (basic)
async function testSQLInjection() {
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --"
  ];
  
  for (const payload of sqlPayloads) {
    const response = await fetchUrl('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: payload })
    });
    
    // If we get a 500 error with SQL error, that's bad
    if (response.status === 500) {
      const body = await response.text();
      if (body.toLowerCase().includes('sql') || body.toLowerCase().includes('syntax')) {
        return { pass: false, message: 'Possible SQL injection vulnerability' };
      }
    }
  }
  
  return { pass: true };
}

// 7. Check for directory listing
async function checkDirectoryListing() {
  const paths = ['/public/', '/.git/', '/node_modules/'];
  
  for (const path of paths) {
    const response = await fetchUrl(path);
    if (response.status === 200) {
      const body = await response.text();
      if (body.includes('Index of') || body.includes('<title>Directory listing')) {
        return { pass: false, message: `Directory listing enabled: ${path}` };
      }
    }
  }
  
  return { pass: true };
}

// 8. Check HTTPS (if production)
async function checkHTTPS() {
  if (targetUrl.startsWith('https://')) {
    return { pass: true };
  }
  
  if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
    return { pass: true, message: 'Local development - HTTPS not required' };
  }
  
  return { pass: false, message: 'Site not using HTTPS' };
}

// 9. Check cookie security flags
async function checkCookieSecurity() {
  const response = await fetchUrl('/api/user/me');
  const setCookie = response.headers.get('set-cookie');
  
  if (setCookie) {
    if (!setCookie.includes('HttpOnly')) {
      return { pass: false, message: 'Cookies missing HttpOnly flag' };
    }
    if (targetUrl.startsWith('https://') && !setCookie.includes('Secure')) {
      return { pass: false, message: 'Cookies missing Secure flag' };
    }
  }
  
  return { pass: true };
}

// 10. Test for sensitive data in responses
async function checkSensitiveDataExposure() {
  const response = await fetchUrl('/api/orders/test-order-123');
  
  if (response.status === 200) {
    const body = await response.text();
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /api[_-]?key/i,
      /token.*[=:].*[a-z0-9]{32,}/i
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(body)) {
        return { pass: false, message: 'Potential sensitive data in response' };
      }
    }
  }
  
  return { pass: true };
}

// 11. Simulate Brute Force Attack
async function simulateBruteForce() {
  const loginUrl = '/api/user/auth/login';
  const attempts = 50;
  let blocked = false;
  
  const requests = [];
  for (let i = 0; i < attempts; i++) {
    requests.push(
      fetchUrl(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@test.com',
          password: `wrongpass${i}`
        })
      })
    );
  }
  
  const responses = await Promise.all(requests);
  const rateLimited = responses.some(r => r.status === 429);
  
  if (!rateLimited) {
    return { pass: false, message: `No rate limiting after ${attempts} brute force attempts` };
  }
  
  return { pass: true };
}

// 12. Test for Command Injection
async function testCommandInjection() {
  const payloads = [
    '; ls -la',
    '| cat /etc/passwd',
    '`whoami`',
    '$(id)'
  ];
  
  for (const payload of payloads) {
    const response = await fetchUrl('/api/lookup-uid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameSlug: 'mobile-legends',
        uid: payload,
        server: '1234'
      })
    });
    
    const body = await response.text();
    // Check if command output appears
    if (body.includes('root:') || body.includes('uid=') || body.includes('bin/bash')) {
      return { pass: false, message: 'Possible command injection vulnerability' };
    }
  }
  
  return { pass: true };
}

// 13. Test for Path Traversal
async function testPathTraversal() {
  const payloads = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
    '%2e%2e/%2e%2e/%2e%2e/etc/passwd'
  ];
  
  for (const payload of payloads) {
    const response = await fetchUrl(`/api/${payload}`);
    
    if (response.status === 200) {
      const body = await response.text();
      if (body.includes('root:') || body.includes('localhost')) {
        return { pass: false, message: 'Path traversal successful' };
      }
    }
  }
  
  return { pass: true };
}

// 14. Test for Insecure Direct Object References (IDOR)
async function testIDOR() {
  // Try to access another user's order
  const response = await fetchUrl('/api/orders/TY-999999');
  
  if (response.status === 200) {
    return { pass: false, message: 'Order accessible without authorization (IDOR)' };
  }
  
  return { pass: true };
}

// 15. Test for Security Misconfiguration
async function testSecurityMisconfig() {
  const riskyPaths = [
    '/.git/config',
    '/backup.sql',
    '/phpinfo.php',
    '/test.php',
    '/.svn/entries'
  ];
  
  for (const path of riskyPaths) {
    const response = await fetchUrl(path);
    if (response.status === 200) {
      return { pass: false, message: `Exposed: ${path}` };
    }
  }
  
  return { pass: true };
}

// Run all tests
(async () => {
  console.log('Running security tests...\n');
  
  // Basic Security Tests
  await test('Security Headers', checkSecurityHeaders);
  await test('Environment Files Exposure', checkEnvExposure);
  await test('HTTPS Usage', checkHTTPS);
  await test('Directory Listing', checkDirectoryListing);
  await test('Cookie Security', checkCookieSecurity);
  
  // Attack Simulation Tests
  console.log('\n--- Attack Simulations ---');
  await test('Rate Limiting (DDoS Protection)', testRateLimiting);
  await test('Brute Force Protection', simulateBruteForce);
  await test('XSS Reflection', testXSSReflection);
  await test('SQL Injection Protection', testSQLInjection);
  await test('Command Injection', testCommandInjection);
  await test('Path Traversal', testPathTraversal);
  await test('IDOR (Insecure Object References)', testIDOR);
  await test('Sensitive Data Exposure', checkSensitiveDataExposure);
  await test('Security Misconfiguration', testSecurityMisconfig);
  
  // Authentication & Authorization
  console.log('\n--- Authentication & Authorization ---');
  await test('Admin Authentication', checkAdminAuth);
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.pass}`);
  console.log(`❌ Failed: ${results.fail}`);
  console.log(`⚠️ Warnings: ${results.warn}`);
  console.log(`📈 Total: ${results.tests.length}`);
  
  if (results.fail > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests
      .filter(t => !t.pass)
      .forEach(t => console.log(`  - ${t.name}: ${t.message}`));
  }
  
  console.log('\n' + '='.repeat(50));
  const score = Math.round((results.pass / results.tests.length) * 100);
  console.log(`🔒 Security Score: ${score}%`);
  
  if (score >= 97) {
    console.log('🎉 Excellent! Your site is highly secure!');
  } else if (score >= 80) {
    console.log('✅ Good security, but fix failing tests.');
  } else {
    console.log('⚠️ Security needs improvement. Fix failing tests immediately!');
  }
  
  console.log('='.repeat(50));
  
  process.exit(results.fail > 0 ? 1 : 0);
})();
