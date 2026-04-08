#!/bin/bash
# Lunatic Eyes — one-command setup
# Usage: bash setup.sh

set -e

echo ""
echo "  LUNATIC EYES — Setup"
echo "  ===================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  Node.js not found. Installing via Homebrew..."
  if ! command -v brew &> /dev/null; then
    echo "  Homebrew not found. Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install node
  echo "  Node.js installed: $(node -v)"
else
  echo "  Node.js found: $(node -v)"
fi

# Check Node version (need 20+)
NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Warning: Node 20+ recommended. You have $(node -v)."
  echo "  Run: brew upgrade node"
fi

# Install dependencies
echo ""
echo "  Installing dependencies..."
npm install

echo ""
echo "  Setup complete."
echo ""
echo "  To start: npm run dev"
echo "  Then open: http://localhost:3000"
echo ""
echo "  Click 'Quick Start' to skip setup and go straight to tracking."
echo ""
