#!/bin/bash

# inst-01.sh: Validate JSON output format
# Reads response from stdin
# Checks: Valid JSON, required keys, correct value types
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

# Try to extract JSON from response (handle markdown fences)
# First try to remove markdown code fences if present
JSON_TEXT=$(echo "$RESPONSE" | sed -n '/^```json/,/^```$/p' | sed '1d;$d' || echo "$RESPONSE")
if [[ -z "$JSON_TEXT" ]]; then
    JSON_TEXT=$(echo "$RESPONSE" | sed -n '/^```/,/^```$/p' | sed '1d;$d' || echo "$RESPONSE")
fi
if [[ -z "$JSON_TEXT" ]]; then
    JSON_TEXT="$RESPONSE"
fi

# Check 1: Valid JSON
if echo "$JSON_TEXT" | jq empty 2>/dev/null; then
    SCORE=$((SCORE + 1))

    # If valid JSON, check required keys and types
    # Check 2: Required keys exist (looking for common patterns)
    if echo "$JSON_TEXT" | jq 'keys' 2>/dev/null | grep -qE '"\w+"'; then
        SCORE=$((SCORE + 1))
    fi

    # Check 3: Check if value types are reasonable (has at least string and/or number types)
    if echo "$JSON_TEXT" | jq '.' 2>/dev/null | grep -qE ':\s*(".*"|[0-9]+|true|false|null)'; then
        SCORE=$((SCORE + 1))
    fi
fi

echo "${SCORE}/3"
