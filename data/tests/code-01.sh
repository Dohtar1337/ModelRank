#!/bin/bash

# code-01.sh: Check authentication bug fix
# Reads model response from stdin
# Checks: Bearer prefix, split/replace/manipulation logic, edge cases
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

# Check 1: Mentions "Bearer" prefix handling
if echo "$RESPONSE" | grep -iq "bearer\|authorization.*header\|bearer.*token" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 2: Contains split, replace, or string manipulation logic
if echo "$RESPONSE" | grep -iE "split|replace|substring|trim|strip|slice" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 3: Mentions edge cases (empty token, whitespace, missing header)
if echo "$RESPONSE" | grep -iE "empty.*token|whitespace|missing.*header|edge.*case|null.*check" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

echo "${SCORE}/3"
