#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Yuzuki MD v2 — Launcher          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Check dependencies ─────────────────────────────────────────────────────
if [ ! -d "node_modules/chalk" ]; then
  echo "📦 Dependencies not found — installing now..."
  echo "   (this only happens once)"
  echo ""
  pnpm install --ignore-workspace --reporter=silent 2>&1 | grep -v "^$" || true
  echo ""
  echo "✅ Dependencies installed."
  echo ""
else
  echo "✅ Dependencies already installed."
fi

# ── 2. Validate required env vars ─────────────────────────────────────────────
if [ -z "$PHONE_NUMBER" ]; then
  echo ""
  echo "❌  PHONE_NUMBER is not set."
  echo "    Add it in the Secrets tab (key: PHONE_NUMBER, value: your number with country code)."
  echo "    Example: 233533416608"
  echo ""
  exit 1
fi

echo "📱 Owner number: $PHONE_NUMBER"
echo "🚀 Starting bot..."
echo ""

# ── 3. Start ──────────────────────────────────────────────────────────────────
exec node src/index.js
