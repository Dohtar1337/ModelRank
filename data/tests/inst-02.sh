#!/bin/bash

# inst-02.sh: Check Python function implementation
# Reads response from stdin
# Checks: No regex imports, correct return type annotation, at least 3 asserts
# Score: X/3

set -euo pipefail

# Read response from stdin
RESPONSE=$(cat)

# Handle empty input
if [[ -z "$RESPONSE" ]]; then
    echo "0/3"
    exit 0
fi

SCORE=0

# Check 1: No "import re" (no regex)
if ! echo "$RESPONSE" | grep -E "^import\s+re$|^from\s+re\s+import|import.*\bre\b" 2>/dev/null | grep -qv "return\|def\|#"; then
    SCORE=$((SCORE + 1))
fi

# Check 2: Has correct return type annotation (-> type_name:)
if echo "$RESPONSE" | grep -E "def\s+\w+\([^)]*\)\s*->\s*\w+" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 3: Contains at least 3 assert statements
ASSERT_COUNT=$(echo "$RESPONSE" | grep -oE "assert\s+" | wc -l)
if [[ $ASSERT_COUNT -ge 3 ]]; then
    SCORE=$((SCORE + 1))
fi

echo "${SCORE}/3"
