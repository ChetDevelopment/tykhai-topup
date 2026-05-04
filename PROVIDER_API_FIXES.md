# Provider API Connection Test Fixes

## Problem
The admin panel's "Test Connection" buttons for GameDrop and G2Bulk APIs were not working properly.

## Root Causes Identified

### 1. G2Bulk Test Route Issues
- **File**: `app/api/admin/g2bulk/test/route.ts`
- **Problems**:
  - No detailed error logging when API calls fail
  - Database update would fail silently or crash if API response structure changed
  - No handling for missing or unexpected response fields

### 2. GameDrop Test Route Issues  
- **File**: `app/api/admin/gamedrop/test/route.ts`
- **Problems**:
  - No detailed error logging
  - No database balance update
  - No handling for API response structure changes

### 3. Library Functions
- **Files**: `lib/gamedrop.ts`, `lib/g2bulk.ts`
- **Problems**:
  - Timeout errors not properly handled
  - No logging of API responses for debugging
  - Error messages not descriptive enough

## Fixes Applied

### 1. Enhanced G2Bulk Test Route
**File**: `app/api/admin/g2bulk/test/route.ts`

Changes:
- ✅ Added detailed error logging with `console.error`
- ✅ Added error response body capture and display
- ✅ Made database updates fault-tolerant (won't fail test if DB update fails)
- ✅ Added type checking for response fields before DB update
- ✅ Returns detailed error information to UI

### 2. Enhanced GameDrop Test Route
**File**: `app/api/admin/gamedrop/test/route.ts`

Changes:
- ✅ Added database balance update on successful test
- ✅ Added detailed error logging
- ✅ Returns more response data (partnerId, isPostpaid)
- ✅ Made database updates fault-tolerant

### 3. Enhanced Library Functions
**Files**: `lib/gamedrop.ts`, `lib/g2bulk.ts`

Changes:
- ✅ Added response logging for debugging
- ✅ Better timeout error handling
- ✅ More descriptive error messages
- ✅ Capture and log API error responses

### 4. Enhanced Admin UI
**File**: `app/admin/settings/page.tsx`

Changes:
- ✅ Shows detailed error details in expandable JSON view
- ✅ Better error message display

### 5. New Diagnostic Tools
**Files**: 
- `scripts/test-provider-connections.ts` (TypeScript)
- `scripts/test-provider-apis.ps1` (PowerShell)

Purpose:
- ✅ Test APIs directly without going through admin panel
- ✅ See raw API responses
- ✅ Debug authentication or response format issues

## How to Test

### Option 1: Via Admin Panel (Recommended)
1. Start the development server: `npm run dev`
2. Go to Admin Panel → Settings
3. Scroll to "GameDrop API" or "G2Bulk API" sections
4. Click "Test Connection" button
5. View results with detailed error messages if failed

### Option 2: Via PowerShell Script
```powershell
# Run from project root
.\scripts\test-provider-apis.ps1
```

### Option 3: Via TypeScript Script
```bash
# Run from project root
npm run test:providers
```

## Expected Results

### GameDrop Success Response
```json
{
  "success": true,
  "balance": 123.45,
  "partnerId": 12345,
  "isPostpaid": false
}
```

### G2Bulk Success Response
```json
{
  "success": true,
  "balance": 123.45,
  "userId": 12345,
  "username": "your_username"
}
```

### Error Response (Both)
```json
{
  "success": false,
  "error": "Detailed error message",
  "details": {
    // Raw API response for debugging
  }
}
```

## Common Issues & Solutions

### Issue: "No token configured"
**Solution**: Go to Admin Panel → Settings and enter the API token, then save.

### Issue: "API timeout"
**Solution**: 
- Check your internet connection
- The API might be temporarily down
- Firewall might be blocking the request

### Issue: "API error: 401" or "API error: 403"
**Solution**: 
- API token is invalid or expired
- Contact the API provider to get a new token

### Issue: "API error: 404"
**Solution**: 
- API endpoint might have changed
- Check provider documentation for updated endpoints

### Issue: Database update fails
**Solution**: 
- Check database connection
- Run `npm run db:push` to ensure schema is up to date
- Check Prisma schema has `currentBalance`, `lastBalanceCheck`, `gameDropPartnerId`, `g2bulkPartnerId` fields

## Monitoring

After fixing, you should see:
- ✅ Green checkmark with balance when test succeeds
- ✅ Balance automatically updates in Settings after successful test
- ✅ Last balance check timestamp updates
- ✅ Detailed error messages if test fails

## Next Steps

If tests still fail after these fixes:

1. **Check API tokens are correct**
   - Contact GameDrop/G2Bulk support to verify tokens

2. **Check network connectivity**
   ```powershell
   Test-NetConnection partner.gamesdrop.io -Port 443
   Test-NetConnection api.g2bulk.com -Port 443
   ```

3. **Check API documentation**
   - Endpoints might have changed
   - Authentication method might have changed

4. **Enable verbose logging**
   - Check server logs for detailed error messages
   - Look for `[gamedrop-test]` or `[g2bulk-test]` prefixes

## Files Modified

1. `app/api/admin/gamedrop/test/route.ts` - Enhanced error handling
2. `app/api/admin/g2bulk/test/route.ts` - Enhanced error handling
3. `lib/gamedrop.ts` - Better logging and error handling
4. `lib/g2bulk.ts` - Better logging and error handling
5. `app/admin/settings/page.tsx` - Show detailed errors
6. `package.json` - Added test scripts
7. `scripts/test-provider-connections.ts` - New diagnostic tool
8. `scripts/test-provider-apis.ps1` - New diagnostic tool
