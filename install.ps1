# Quick-start Repo Assist on Windows
# Run in PowerShell:
#   irm https://raw.githubusercontent.com/dsyme/repo-assist/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

# Check prerequisites
function Test-Command($cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Test-Command "git"))  { Write-Error "git is required — https://git-scm.com"; exit 1 }
if (-not (Test-Command "node")) { Write-Error "Node.js >= 20 is required — https://nodejs.org"; exit 1 }
if (-not (Test-Command "gh"))   { Write-Error "GitHub CLI (gh) is required — https://cli.github.com"; exit 1 }

# Check gh auth
$authOut = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "Run 'gh auth login' first"; exit 1 }

$Dir = Join-Path $HOME "repo-assist"

Write-Host "==> Cloning repo-assist into $Dir ..." -ForegroundColor Cyan
if (Test-Path $Dir) {
    Push-Location $Dir
    git pull --ff-only
    Pop-Location
} else {
    git clone "https://github.com/dsyme/repo-assist.git" $Dir
}

Push-Location $Dir

Write-Host "==> Installing npm dependencies..." -ForegroundColor Cyan
npm install

Write-Host "==> Building..." -ForegroundColor Cyan
npx electron-vite build

Pop-Location

Write-Host ""
Write-Host "Done! Repo Assist installed in $Dir" -ForegroundColor Green
Write-Host "  Run:  cd $Dir; npm run dev"
