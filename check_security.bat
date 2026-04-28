@echo off
echo === SECURITY COMPLETION STATUS ===
echo.

echo 1. lib/auth.ts:
findstr /C:"requireUser" lib\auth.ts >nul 2>&1 && echo    ✅ requireUser() added || echo    ❌ requireUser() missing
findstr /C:"requireAdmin" lib\auth.ts >nul 2>&1 && echo    ✅ requireAdmin() added || echo    ❌ requireAdmin() missing
findstr /C:"checkSessionTimeout" lib\auth.ts >nul 2>&1 && echo    ✅ checkSessionTimeout() added || echo    ❌ checkSessionTimeout() missing

echo.
echo 2. lib/rate-limit.ts:
findstr /C:"RATE_LIMITS" lib\rate-limit.ts >nul 2>&1 && echo    ✅ RATE_LIMITS defined || echo    ❌ RATE_LIMITS missing
findstr /C:"checkIPBlock" lib\rate-limit.ts >nul 2>&1 && echo    ✅ checkIPBlock() added || echo    ❌ checkIPBlock() missing
findstr /C:"blockIP" lib\rate-limit.ts >nul 2>&1 && echo    ✅ blockIP() added || echo    ❌ blockIP() missing

echo.
echo 3. lib/encryption.ts:
if exist lib\encryption.ts (echo    ✅ Encryption library created) else (echo    ❌ Encryption library missing)

echo.
echo === ADMIN ROUTES (Sample Check) ===
echo.
for %%f in (app\api\admin\orders\route.ts app\api\admin\products\route.ts app\api\admin\settings\route.ts app\api\admin\export\route.ts) do (
  echo %%f:
  findstr /C:"requireAdmin" "%%f" >nul 2>&1 && echo    ✅ has requireAdmin || echo    ❌ missing requireAdmin
  findstr /C:"rateLimit" "%%f" >nul 2>&1 && echo    ✅ has rateLimit || echo    ❌ missing rateLimit
  findstr /C:"checkIPBlock" "%%f" >nul 2>&1 && echo    ✅ has checkIPBlock || echo    ❌ missing checkIPBlock
  echo.
)

echo === USER ROUTES (Sample Check) ===
echo.
for %%f in (app\api\user\me\route.ts app\api\orders\[orderNumber]\route.ts) do (
  echo %%f:
  findstr /C:"requireUser" "%%f" >nul 2>&1 && echo    ✅ has requireUser || echo    ❌ missing requireUser
  findstr /C:"rateLimit" "%%f" >nul 2>&1 && echo    ✅ has rateLimit || echo    ❌ missing rateLimit
  echo.
)

echo.
echo === DELETED FILES ===
if not exist "app\api\test-email\route.ts" (echo ✅ test-email route deleted) else (echo ❌ test-email route still exists)

echo.
echo === REMAINING WORK ===
echo ❌ 25+ admin routes need requireAdmin + rateLimit
echo ❌ 15+ user routes need requireUser + rateLimit  
echo ❌ User.email and Admin.email need encryption
echo ❌ Disable payment simulation in production
echo ❌ Add CSRF protection
echo ❌ Add idempotency keys for payments
echo.
echo Current Security Score: ~35% (Target: 97%%+)
pause
