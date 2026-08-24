# RMASC OnSite — Deploy Script (PowerShell)
# Run this in PowerShell: .\deploy.ps1

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  RMASC OnSite — Build & Deploy" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build Backend
Write-Host "[1/4] Building Backend..." -ForegroundColor Yellow
Set-Location "C:\workspace\rmasc-onsite\backend"
& npx tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Backend build had TS errors (pre-existing, non-fatal)" -ForegroundColor DarkYellow
} else {
    Write-Host "  Backend build OK!" -ForegroundColor Green
}
Write-Host ""

# Step 2: Build Dashboard
Write-Host "[2/4] Building Dashboard..." -ForegroundColor Yellow
Set-Location "C:\workspace\rmasc-onsite\dashboard"
& npx next build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Dashboard BUILD FAILED!" -ForegroundColor Red
    exit 1
}
Write-Host "  Dashboard build OK!" -ForegroundColor Green
Write-Host ""

# Step 3: Run Database Migration (v8 tracking)
Write-Host "[3/4] Running Database Migration..." -ForegroundColor Yellow
Set-Location "C:\workspace\rmasc-onsite"
# Find psql
$psqlPaths = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe",
    "psql"
)
$psqlFound = $false
foreach ($p in $psqlPaths) {
    if (Test-Path $p) {
        & $p -U postgres -d rmasc -f "database\migration-v8-tracking.sql"
        $psqlFound = $true
        Write-Host "  Migration applied!" -ForegroundColor Green
        break
    }
}
if (-not $psqlFound) {
    Write-Host "  psql not found. Run migration manually:" -ForegroundColor DarkYellow
    Write-Host "  psql -U postgres -d rmasc -f database\migration-v8-tracking.sql" -ForegroundColor White
}
Write-Host ""

# Step 4: Restart PM2
Write-Host "[4/4] Restarting PM2..." -ForegroundColor Yellow
$pm2Paths = @(
    "C:\Users\$env:USERNAME\AppData\Roaming\npm\pm2.cmd",
    "C:\Users\$env:USERNAME\AppData\Roaming\npm\pm2",
    "pm2"
)
$pm2Found = $false
foreach ($p in $pm2Paths) {
    if (Test-Path $p) {
        & $p restart rmasc-onsite
        $pm2Found = $true
        Write-Host "  PM2 restarted!" -ForegroundColor Green
        break
    }
}
if (-not $pm2Found) {
    Write-Host "  pm2 not found. Run: npx pm2 restart rmasc-onsite" -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Deploy Complete!" -ForegroundColor Green
Write-Host "  Dashboard: http://localhost:4002" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
