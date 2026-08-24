@echo off
echo ═══════════════════════════════════════════════════════════
echo  RMASC OnSite — Build & Restart
echo ═══════════════════════════════════════════════════════════

echo.
echo [1/3] Building Backend...
cd /d C:\workspace\rmasc-onsite\backend
call npx tsc
if %ERRORLEVEL% NEQ 0 (
    echo ⚠ Backend build had warnings (non-fatal, noEmitOnError=false)
)

echo.
echo [2/3] Building Dashboard...
cd /d C:\workspace\rmasc-onsite\dashboard
call npx next build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Dashboard build FAILED!
    pause
    exit /b 1
)
echo ✅ Dashboard build complete!

echo.
echo [3/3] Restarting PM2...
cd /d C:\workspace\rmasc-onsite
pm2 restart rmasc-onsite
if %ERRORLEVEL% NEQ 0 (
    echo ⚠ PM2 restart failed — try: pm2 restart all
)

echo.
echo ═══════════════════════════════════════════════════════════
echo  ✅ Build & Deploy Complete!
echo  Dashboard: http://localhost:4002
echo ═══════════════════════════════════════════════════════════
pause
