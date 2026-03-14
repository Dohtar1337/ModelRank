#!/bin/bash

# code-02.sh: Check rate limiter implementation
# Reads response from stdin
# Checks: Map/tracking data structure, 429 status, Retry-After header, cleanup/expiry
# Score: X/4

set -euo pipefail

# Read response from stdin
RESPONSE=$(cat)

# Handle empty input
if [[ -z "$RESPONSE" ]]; then
    echo "0/4"
    exit 0
fi

SCORE=0

# Check 1: Has Map or tracking data structure
if echo "$RESPONSE" | grep -iE "map|dictionary|hash|object|struct|tracking|counter|cache" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 2: Returns 429 status code
if echo "$RESPONSE" | grep -iE "429|too.*many.*request" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 3: Includes Retry-After header
if echo "$RESPONSE" | grep -iE "retry.*after|x-ratelimit" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

# Check 4: Has cleanup/expiry mechanism
if echo "$RESPONSE" | grep -iE "cleanup|expir|ttl|timeout|reset|clear.*old|prune" 2>/dev/null; then
    SCORE=$((SCORE + 1))
fi

echo "${SCORE}/4"
