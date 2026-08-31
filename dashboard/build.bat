@echo off
cd /d C:\workspace\rmasc-onsite\dashboard
echo Building RMASC OnSite Dashboard...
npx next build
if %ERRORLEVEL% EQU 0 (
    echo ✅ Dashboard build complete!
) else (
    echo ❌ Build failed with errors.
)
pause
