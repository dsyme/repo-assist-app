#!/usr/bin/env bash
# Quick-start Repo Assist — run with:
#   curl -fsSL https://raw.githubusercontent.com/dsyme/repo-assist/main/install.sh | bash
set -e

REPO="https://github.com/dsyme/repo-assist.git"
DIR="$HOME/repo-assist"

command -v git  >/dev/null || { echo "Error: git is required";  exit 1; }
command -v node >/dev/null || { echo "Error: Node.js >= 20 is required"; exit 1; }
command -v gh   >/dev/null || { echo "Error: GitHub CLI (gh) is required — https://cli.github.com"; exit 1; }

# Check gh auth
gh auth status >/dev/null 2>&1 || { echo "Error: run 'gh auth login' first"; exit 1; }

echo "==> Cloning repo-assist into $DIR …"
if [ -d "$DIR" ]; then
  cd "$DIR" && git pull --ff-only
else
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi

# WSL2: install system libraries if needed
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "==> WSL2 detected — installing Electron system deps (needs sudo)…"
  sudo bash setup-wsl.sh
fi

echo "==> Installing npm dependencies…"
npm install

echo "==> Building…"
npx electron-vite build

echo ""
echo "✓ Repo Assist installed in $DIR"
echo "  Run:  cd $DIR && npm run dev"
