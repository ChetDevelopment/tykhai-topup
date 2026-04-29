# Security Testing Tool

This tool helps you test your own website for common security vulnerabilities.

## Usage

```bash
# Test local development server
node scripts/security-test.js http://localhost:3000

# Test production site
node scripts/security-test.js https://your-domain.com
```

## What it tests

1. **Security Headers** - Checks for proper CSP, X-Frame-Options, etc.
2. **Environment File Exposure** - Ensures .env files aren't publicly accessible
3. **Rate Limiting** - Tests if API endpoints have rate limiting
4. **XSS Protection** - Checks for reflected XSS vulnerabilities
5. **Admin Authentication** - Verifies admin routes require authentication
6. **SQL Injection Protection** - Basic SQL injection tests
7. **Directory Listing** - Checks if directory listing is disabled
8. **HTTPS Usage** - Ensures site uses HTTPS in production
9. **Cookie Security** - Checks for HttpOnly and Secure flags
10. **Sensitive Data Exposure** - Scans for leaked secrets in responses

## Important Notes

- ⚠️ Only use on websites you own or have permission to test
- This tool performs read-only tests (no destructive actions)
- Some tests may trigger rate limiting (that's good!)
- Run against both local and production environments
- Fix any failed tests immediately

## Extending

Add more tests by following the pattern:

```javascript
async function myCustomTest() {
  // Your test logic
  return { pass: true }; // or { pass: false, message: '...' }
}
```

Then add to the test runner:
```javascript
await test('My Custom Test', myCustomTest);
```
