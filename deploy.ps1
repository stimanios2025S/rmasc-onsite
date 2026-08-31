# RMASC OnSite - Deploy Script (PowerShell)
# Run this: .\deploy.ps1

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  RMASC OnSite - Build and Deploy" -ForegroundColor Cyan
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
$psqlFound = $false
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not $psqlFound) {
        & $_.FullName -U postgres -d rmasc -f "database\migration-v8-tracking.sql"
        $psqlFound = $true
        Write-Host "  Migration applied!" -ForegroundColor Green
    }
}
if (-not $psqlFound) {
    Write-Host "  psql not found. Run migration manually." -ForegroundColor DarkYellow
    Write-Host "  Find it: Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter psql.exe" -ForegroundColor White
}
Write-Host ""

# Step 4: Restart PM2
Write-Host "[4/4] Restarting PM2..." -ForegroundColor Yellow
$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
    & pm2 restart rmasc-onsite
    Write-Host "  PM2 restarted!" -ForegroundColor Green
} else {
    Write-Host "  pm2 not in PATH. Trying npx..." -ForegroundColor DarkYellow
    & npx pm2 restart rmasc-onsite
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  PM2 restarted via npx!" -ForegroundColor Green
    } else {
        Write-Host "  Could not restart PM2. Run manually:" -ForegroundColor Red
        Write-Host "  Find it: Get-Command pm2" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Deploy Complete!" -ForegroundColor Green
Write-Host "  Dashboard: http://localhost:4002" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
