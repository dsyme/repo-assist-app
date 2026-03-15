#!/bin/bash
# Install system dependencies required for Electron on WSL2/Ubuntu
# Run: sudo bash setup-wsl.sh

set -e

echo "Installing Electron dependencies for WSL2..."
apt-get update -qq
apt-get install -y -qq \
  libnspr4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2t64 \
  fonts-noto-color-emoji

echo "Done. You can now run: npm run dev"
