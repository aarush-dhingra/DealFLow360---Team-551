#!/usr/bin/env bash
# Run all DealFlow360 test scripts
# Usage: bash tests/run-all.sh [PORT]
# Example: bash tests/run-all.sh 3000

set -euo pipefail
PORT=${1:-3000}
export PORT

PASS=0
FAIL=0

run_test() {
  local name=$1
  local file=$2
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Running: $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if node "$file"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    echo "  [FAILED] $name"
  fi
}

# Health check before running anything
echo ""
echo "Checking API health on port $PORT..."
if ! curl -sf "http://localhost:$PORT/health" > /dev/null; then
  echo "ERROR: Backend not responding at http://localhost:$PORT"
  echo "Start the backend first: npm start"
  exit 1
fi
echo "  API is up."

# Run all tests
run_test "Quick Test Flow (§9 Login → Payment)"       tests/quick-flow.mjs
run_test "Complete E2E Flow (§5 Full Spec)"           tests/e2e-complete-flow.mjs

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ALL TESTS DONE   Suites passed: $PASS   Failed: $FAIL"
echo "════════════════════════════════════════════════════════"
echo ""
[ $FAIL -eq 0 ] || exit 1
