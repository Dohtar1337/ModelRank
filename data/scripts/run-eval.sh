#!/bin/bash

set -uo pipefail

# ── Defaults ──
CONFIG_DIR="/app/data/config"
RESULTS_DIR="/app/data/results"
TESTS_DIR="/app/data/tests"
MODELS_FILTER=""
CATEGORY_FILTER=""
TIER=""
EXISTING_RUN_ID=""

# ── Parse arguments ──
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <tier> [--models m1,m2] [--category c1,c2] [--config-dir path] [--results-dir path] [--tests-dir path]"
    exit 1
fi

TIER="$1"
shift || true

while [[ $# -gt 0 ]]; do
    case "$1" in
        --models)      MODELS_FILTER="$2"; shift 2 ;;
        --category)    CATEGORY_FILTER="$2"; shift 2 ;;
        --config-dir)  CONFIG_DIR="$2"; shift 2 ;;
        --results-dir) RESULTS_DIR="$2"; shift 2 ;;
        --tests-dir)   TESTS_DIR="$2"; shift 2 ;;
        --run-id)      EXISTING_RUN_ID="$2"; shift 2 ;;
        *)             echo "Unknown: $1"; exit 1 ;;
    esac
done

# ── Verify config files ──
for f in providers.json models.json battery.json; do
    if [[ ! -f "$CONFIG_DIR/$f" ]]; then
        echo "ERROR: $CONFIG_DIR/$f not found" >&2
        exit 1
    fi
done

PROVIDERS_JSON="$CONFIG_DIR/providers.json"
MODELS_JSON="$CONFIG_DIR/models.json"
BATTERY_JSON="$CONFIG_DIR/battery.json"

# ── Generate or use existing run ID ──
if [[ -n "$EXISTING_RUN_ID" ]]; then
    RUN_ID="$EXISTING_RUN_ID"
    OUTPUT_DIR="${RESULTS_DIR}/${RUN_ID}"
    if [[ ! -d "$OUTPUT_DIR" ]]; then
        echo "ERROR: Existing run directory not found: $OUTPUT_DIR" >&2
        exit 1
    fi
    RAW_FILE="${OUTPUT_DIR}/raw_data.json"
    STATUS_FILE="${OUTPUT_DIR}/status.json"
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
else
    RUN_ID=$(date +%Y%m%d_%H%M%S)_${TIER}
    OUTPUT_DIR="${RESULTS_DIR}/${RUN_ID}"
    mkdir -p "$OUTPUT_DIR/judgments"
    STATUS_FILE="${OUTPUT_DIR}/status.json"
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    RAW_FILE="${OUTPUT_DIR}/raw_data.json"
fi

# ── Build list of model keys to test ──
# models.json is { "models": { "key": { ... } } }
if [[ -n "$MODELS_FILTER" ]]; then
    # Filter to requested model keys
    ALL_MODEL_KEYS=""
    IFS=',' read -ra MFILTER <<< "$MODELS_FILTER"
    for mk in "${MFILTER[@]}"; do
        mk=$(echo "$mk" | xargs)  # trim whitespace
        exists=$(jq -r --arg k "$mk" '.models[$k] // empty | .model_id' "$MODELS_JSON")
        if [[ -n "$exists" ]]; then
            ALL_MODEL_KEYS="${ALL_MODEL_KEYS}${mk}"$'\n'
        fi
    done
else
    ALL_MODEL_KEYS=$(jq -r '.models | keys[]' "$MODELS_JSON")
fi

# Remove empty lines
ALL_MODEL_KEYS=$(echo "$ALL_MODEL_KEYS" | sed '/^$/d')

if [[ -z "$ALL_MODEL_KEYS" ]]; then
    echo "ERROR: No models found" >&2
    exit 1
fi

# ── Build list of prompt objects to test ──
# battery.json has:
#   "tiers": { "quick": ["orch-01", "code-01", ...], ... }
#   "prompts": [ { "id": "orch-01", "category": "...", "prompt": "...", ... }, ... ]

# Get prompt IDs for this tier
TIER_PROMPT_IDS=$(jq -r --arg t "$TIER" '.tiers[$t][]? // empty' "$BATTERY_JSON")

if [[ -z "$TIER_PROMPT_IDS" ]]; then
    echo "ERROR: No prompts found for tier: $TIER" >&2
    exit 1
fi

# Apply category filter if set
if [[ -n "$CATEGORY_FILTER" ]]; then
    FILTERED_IDS=""
    while IFS= read -r pid; do
        pcat=$(jq -r --arg id "$pid" '.prompts[] | select(.id == $id) | .category' "$BATTERY_JSON")
        IFS=',' read -ra CFILTER <<< "$CATEGORY_FILTER"
        for cf in "${CFILTER[@]}"; do
            cf=$(echo "$cf" | xargs)
            if [[ "$pcat" == "$cf" ]]; then
                FILTERED_IDS="${FILTERED_IDS}${pid}"$'\n'
                break
            fi
        done
    done <<< "$TIER_PROMPT_IDS"
    TIER_PROMPT_IDS=$(echo "$FILTERED_IDS" | sed '/^$/d')
fi

if [[ -z "$TIER_PROMPT_IDS" ]]; then
    echo "ERROR: No prompts match the filters" >&2
    exit 1
fi

# ── Count tasks ──
PROMPT_COUNT=$(echo "$TIER_PROMPT_IDS" | wc -l)
MODEL_COUNT=$(echo "$ALL_MODEL_KEYS" | wc -l)
TOTAL_TASKS=$((PROMPT_COUNT * MODEL_COUNT))
CURRENT_TASK=0
TOTAL_COST="0"
TOTAL_CALLS=0

echo "PROGRESS:0/${TOTAL_TASKS}"

# Write initial status
cat > "$STATUS_FILE" <<STATUSEOF
{"running": true, "run_id": "${RUN_ID}", "current": 0, "total": ${TOTAL_TASKS}, "current_model": "", "current_prompt": "", "started_at": "${TIMESTAMP}"}
STATUSEOF

# ── Build initial raw_data.json (only for new runs) ──
if [[ -z "$EXISTING_RUN_ID" ]]; then
    # Populate models section
    MODELS_OBJ=$(jq '.models' "$MODELS_JSON")
    PROMPTS_OBJ="{}"
    while IFS= read -r pid; do
        PDATA=$(jq -c --arg id "$pid" '.prompts[] | select(.id == $id) | {name, category, prompt, expected_traits, test_script}' "$BATTERY_JSON")
        if [[ -n "$PDATA" ]]; then
            PROMPTS_OBJ=$(echo "$PROMPTS_OBJ" | jq --arg id "$pid" --argjson data "$PDATA" '. + {($id): $data}')
        fi
    done <<< "$TIER_PROMPT_IDS"

    jq -n \
        --arg run_id "$RUN_ID" \
        --arg tier "$TIER" \
        --arg ts "$TIMESTAMP" \
        --argjson models "$MODELS_OBJ" \
        --argjson prompts "$PROMPTS_OBJ" \
        '{run_id: $run_id, tier: $tier, timestamp: $ts, models: $models, prompts: $prompts, results: {}, total_cost: 0, total_calls: 0}' \
        > "$RAW_FILE"
else
    # For existing runs, add any new prompts to the existing raw_data.json
    MODELS_OBJ=$(jq '.models' "$MODELS_JSON")
    PROMPTS_OBJ="{}"
    while IFS= read -r pid; do
        PDATA=$(jq -c --arg id "$pid" '.prompts[] | select(.id == $id) | {name, category, prompt, expected_traits, test_script}' "$BATTERY_JSON")
        if [[ -n "$PDATA" ]]; then
            PROMPTS_OBJ=$(echo "$PROMPTS_OBJ" | jq --arg id "$pid" --argjson data "$PDATA" '. + {($id): $data}')
        fi
    done <<< "$TIER_PROMPT_IDS"

    # Merge new prompts into existing raw_data.json
    TEMP_FILE=$(mktemp)
    jq --argjson models "$MODELS_OBJ" \
       --argjson prompts "$PROMPTS_OBJ" \
       '.models += $models | .prompts += $prompts' \
       "$RAW_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$RAW_FILE"
fi

# ── Main eval loop ──
while IFS= read -r PROMPT_ID; do
    [[ -z "$PROMPT_ID" ]] && continue

    # Get prompt data
    PROMPT_TEXT=$(jq -r --arg id "$PROMPT_ID" '.prompts[] | select(.id == $id) | .prompt' "$BATTERY_JSON")
    PROMPT_NAME=$(jq -r --arg id "$PROMPT_ID" '.prompts[] | select(.id == $id) | .name' "$BATTERY_JSON")
    TEST_SCRIPT=$(jq -r --arg id "$PROMPT_ID" '.prompts[] | select(.id == $id) | .test_script // ""' "$BATTERY_JSON")

    while IFS= read -r MODEL_KEY; do
        [[ -z "$MODEL_KEY" ]] && continue

        CURRENT_TASK=$((CURRENT_TASK + 1))

        # Get model definition (object keyed)
        MODEL_ID=$(jq -r --arg k "$MODEL_KEY" '.models[$k].model_id // empty' "$MODELS_JSON")
        MODEL_LABEL=$(jq -r --arg k "$MODEL_KEY" '.models[$k].label // $k' "$MODELS_JSON")
        PROVIDER_KEY=$(jq -r --arg k "$MODEL_KEY" '.models[$k].provider // empty' "$MODELS_JSON")
        COST_IN=$(jq -r --arg k "$MODEL_KEY" '.models[$k].cost_per_1m_in // 0' "$MODELS_JSON")
        COST_OUT=$(jq -r --arg k "$MODEL_KEY" '.models[$k].cost_per_1m_out // 0' "$MODELS_JSON")

        if [[ -z "$MODEL_ID" || -z "$PROVIDER_KEY" ]]; then
            echo "WARN: Skipping model $MODEL_KEY — missing model_id or provider" >&2
            echo "PROGRESS:${CURRENT_TASK}/${TOTAL_TASKS}|${MODEL_KEY}|${PROMPT_ID}"
            continue
        fi

        # Get provider definition (object keyed)
        BASE_URL=$(jq -r --arg k "$PROVIDER_KEY" '.providers[$k].base_url // empty' "$PROVIDERS_JSON")
        API_KEY_ENV=$(jq -r --arg k "$PROVIDER_KEY" '.providers[$k].api_key_env // ""' "$PROVIDERS_JSON")

        if [[ -z "$BASE_URL" ]]; then
            echo "WARN: Provider $PROVIDER_KEY not found or has no base_url" >&2
            echo "PROGRESS:${CURRENT_TASK}/${TOTAL_TASKS}|${MODEL_LABEL}|${PROMPT_NAME}"
            continue
        fi

        # Get API key (allow empty for local providers)
        API_KEY=""
        if [[ -n "$API_KEY_ENV" ]]; then
            eval "API_KEY=\${$API_KEY_ENV:-}"
        fi

        # Build custom headers from provider config
        HEADER_ARGS=()
        HEADER_ARGS+=(-H "Content-Type: application/json")
        if [[ -n "$API_KEY" ]]; then
            HEADER_ARGS+=(-H "Authorization: Bearer $API_KEY")
        fi

        # Add provider custom headers
        CUSTOM_HEADERS=$(jq -r --arg k "$PROVIDER_KEY" '.providers[$k].headers // {} | to_entries[] | "\(.key): \(.value)"' "$PROVIDERS_JSON" 2>/dev/null || true)
        while IFS= read -r hdr; do
            [[ -n "$hdr" ]] && HEADER_ARGS+=(-H "$hdr")
        done <<< "$CUSTOM_HEADERS"

        # Show progress BEFORE the request (so UI updates immediately)
        echo "PROGRESS:${CURRENT_TASK}/${TOTAL_TASKS}|${MODEL_LABEL}|${PROMPT_NAME}"
        cat > "$STATUS_FILE" <<PRESTATUSEOF
{"running": true, "run_id": "${RUN_ID}", "current": ${CURRENT_TASK}, "total": ${TOTAL_TASKS}, "current_model": "${MODEL_LABEL}", "current_prompt": "${PROMPT_NAME}", "started_at": "${TIMESTAMP}"}
PRESTATUSEOF

        # Build request body — standard OpenAI chat/completions format
        REQUEST_BODY=$(jq -n \
            --arg model "$MODEL_ID" \
            --arg text "$PROMPT_TEXT" \
            '{
                model: $model,
                messages: [{ role: "user", content: $text }],
                max_completion_tokens: 4096
            }')

        # Endpoint: append /chat/completions to base URL
        ENDPOINT="${BASE_URL%/}/chat/completions"

        # Execute request with retry for rate limits (429)
        MAX_RETRIES=3
        RETRY_DELAYS=(5 15 30)
        ATTEMPT=0
        HTTP_CODE=""
        TIME_TOTAL="0"

        while [[ $ATTEMPT -lt $MAX_RETRIES ]]; do
            RESP_FILE=$(mktemp)
            CURL_OUTPUT=$(curl -s -w "\n%{http_code}\n%{time_total}" \
                --connect-timeout 10 \
                --max-time 300 \
                "${HEADER_ARGS[@]}" \
                -d "$REQUEST_BODY" \
                "$ENDPOINT" \
                -o "$RESP_FILE" 2>/dev/null || echo -e "\n000\n0")

            # Parse curl output — skip blank lines for HTTP code
            HTTP_CODE=$(echo "$CURL_OUTPUT" | grep -E '^[0-9]{3}$' | head -1)
            TIME_TOTAL=$(echo "$CURL_OUTPUT" | tail -1)
            if [[ -z "$HTTP_CODE" ]]; then
                HTTP_CODE=$(echo "$CURL_OUTPUT" | sed -n '2p')
            fi

            # Check for rate limit
            if [[ "$HTTP_CODE" == "429" ]]; then
                ATTEMPT=$((ATTEMPT + 1))
                if [[ $ATTEMPT -lt $MAX_RETRIES ]]; then
                    WAIT=${RETRY_DELAYS[$ATTEMPT-1]:-30}
                    echo "[RATE-LIMIT] Model=$MODEL_LABEL got HTTP 429, retry $ATTEMPT/$MAX_RETRIES in ${WAIT}s..." >&2
                    echo "PROGRESS:${CURRENT_TASK}/${TOTAL_TASKS}|${MODEL_LABEL}|RATE LIMITED - retry in ${WAIT}s"
                    rm -f "$RESP_FILE"
                    sleep "$WAIT"
                else
                    echo "[RATE-LIMIT] Model=$MODEL_LABEL exhausted retries after 429" >&2
                fi
            else
                break
            fi
        done

        # Convert time_total (seconds with decimals) to milliseconds
        LATENCY_MS=$(echo "$TIME_TOTAL" | awk '{printf "%d", $1 * 1000}' 2>/dev/null || echo "0")
        if [[ "$LATENCY_MS" -lt 1 ]]; then
            LATENCY_MS=1
        fi

        RESPONSE=$(cat "$RESP_FILE" 2>/dev/null || echo "{}")
        rm -f "$RESP_FILE"

        # Debug: log HTTP code and response size
        RESP_SIZE=${#RESPONSE}
        echo "[DEBUG] Model=$MODEL_LABEL HTTP=$HTTP_CODE Time=${TIME_TOTAL}s RespSize=${RESP_SIZE}bytes" >&2

        # Parse response
        CONTENT=""
        PROMPT_TOKENS=0
        COMPLETION_TOKENS=0
        COST="0"
        TEST_RESULT="null"
        ERROR="null"

        if [[ "$HTTP_CODE" == "200" ]]; then
            CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // ""' 2>/dev/null || echo "")
            PROMPT_TOKENS=$(echo "$RESPONSE" | jq -r '.usage.prompt_tokens // 0' 2>/dev/null || echo "0")
            COMPLETION_TOKENS=$(echo "$RESPONSE" | jq -r '.usage.completion_tokens // 0' 2>/dev/null || echo "0")

            # Fallback: if provider didn't return tokens, fetch from OpenRouter generation stats
            if [[ "$PROMPT_TOKENS" == "0" && "$COMPLETION_TOKENS" == "0" ]]; then
                GEN_ID=$(echo "$RESPONSE" | jq -r '.id // empty' 2>/dev/null)
                if [[ -n "$GEN_ID" && -n "$API_KEY" ]]; then
                    # Wait briefly for OpenRouter to finalize stats
                    sleep 2
                    GEN_STATS=$(curl -s --max-time 10 \
                        -H "Authorization: Bearer $API_KEY" \
                        "https://openrouter.ai/api/v1/generation?id=$GEN_ID" 2>/dev/null || echo "{}")
                    FALLBACK_PT=$(echo "$GEN_STATS" | jq -r '.data.tokens_prompt // .data.native_tokens_prompt // 0' 2>/dev/null || echo "0")
                    FALLBACK_CT=$(echo "$GEN_STATS" | jq -r '.data.tokens_completion // .data.native_tokens_completion // 0' 2>/dev/null || echo "0")
                    if [[ "$FALLBACK_PT" != "0" || "$FALLBACK_CT" != "0" ]]; then
                        PROMPT_TOKENS="$FALLBACK_PT"
                        COMPLETION_TOKENS="$FALLBACK_CT"
                        echo "[DEBUG] Token fallback from /generation: in=$PROMPT_TOKENS out=$COMPLETION_TOKENS" >&2
                    fi
                fi
            fi

            echo "[DEBUG] Model=$MODEL_LABEL Tokens: in=$PROMPT_TOKENS out=$COMPLETION_TOKENS ContentLen=${#CONTENT}" >&2

            # Calculate cost
            COST=$(echo "scale=8; ($PROMPT_TOKENS * $COST_IN / 1000000) + ($COMPLETION_TOKENS * $COST_OUT / 1000000)" | bc 2>/dev/null || echo "0")

            # Calculate speed (tokens per second)
            if [[ "$LATENCY_MS" -gt 0 && "$COMPLETION_TOKENS" -gt 0 ]]; then
                SPEED_TPS=$(echo "scale=2; $COMPLETION_TOKENS / ($LATENCY_MS / 1000)" | bc 2>/dev/null)
                # bc can fail silently on division by zero, so validate the result
                if [[ -z "$SPEED_TPS" ]]; then
                    SPEED_TPS="0"
                fi
            else
                SPEED_TPS="0"
            fi

            # Run test script if available
            if [[ -n "$TEST_SCRIPT" && "$TEST_SCRIPT" != "null" && -f "$TESTS_DIR/$TEST_SCRIPT" ]]; then
                TEST_OUTPUT=$(echo "$CONTENT" | bash "$TESTS_DIR/$TEST_SCRIPT" 2>/dev/null || echo "0/0")
                TEST_RESULT="\"$TEST_OUTPUT\""
            fi
        else
            ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message // .error // "HTTP '$HTTP_CODE'"' 2>/dev/null || echo "HTTP $HTTP_CODE")
            ERROR="\"$ERROR_MSG\""
            echo "[ERROR] Model=$MODEL_LABEL HTTP=$HTTP_CODE Error=$ERROR_MSG" >&2
            echo "[ERROR] Response first 200 chars: ${RESPONSE:0:200}" >&2
        fi

        TOTAL_CALLS=$((TOTAL_CALLS + 1))
        TOTAL_COST=$(echo "scale=8; $TOTAL_COST + $COST" | bc 2>/dev/null || echo "$TOTAL_COST")

        # Update raw_data.json — results[prompt_id][model_key] = { ... }
        TEMP_FILE=$(mktemp)
        jq --arg pid "$PROMPT_ID" \
           --arg mk "$MODEL_KEY" \
           --arg resp "$CONTENT" \
           --argjson pt "$PROMPT_TOKENS" \
           --argjson ct "$COMPLETION_TOKENS" \
           --argjson lat "$LATENCY_MS" \
           --arg cost "$COST" \
           --arg speed "$SPEED_TPS" \
           --argjson test "$TEST_RESULT" \
           --argjson err "$ERROR" \
           --argjson tc "$TOTAL_CALLS" \
           --arg tcost "$TOTAL_COST" \
           '
           .results[$pid] //= {} |
           .results[$pid][$mk] = {
               response: $resp,
               prompt_tokens: $pt,
               completion_tokens: $ct,
               latency_ms: $lat,
               cost: ($cost | tonumber),
               speed_tps: ($speed | tonumber),
               test_result: $test,
               error: $err
           } |
           .total_calls = $tc |
           .total_cost = ($tcost | tonumber)
           ' "$RAW_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$RAW_FILE"

        echo "PROGRESS:${CURRENT_TASK}/${TOTAL_TASKS}|${MODEL_LABEL}|${PROMPT_NAME}"

        # Update status file
        cat > "$STATUS_FILE" <<STATUSEOF
{"running": true, "run_id": "${RUN_ID}", "current": ${CURRENT_TASK}, "total": ${TOTAL_TASKS}, "current_model": "${MODEL_LABEL}", "current_prompt": "${PROMPT_NAME}", "started_at": "${TIMESTAMP}"}
STATUSEOF

    done <<< "$ALL_MODEL_KEYS"
done <<< "$TIER_PROMPT_IDS"

# ── Generate per-category markdown files ──
CATEGORIES=$(jq -r '[.prompts | to_entries[].value.category] | unique[]' "$RAW_FILE" 2>/dev/null)
CAT_IDX=1
while IFS= read -r CAT; do
    [[ -z "$CAT" ]] && continue
    CAT_FILE=$(printf "%s/%02d_%s.md" "$OUTPUT_DIR" "$CAT_IDX" "$CAT")
    CAT_IDX=$((CAT_IDX + 1))
    {
        echo "# Category: $CAT"
        echo ""
        jq -r --arg cat "$CAT" '.prompts | to_entries[] | select(.value.category == $cat) | .key' "$RAW_FILE" | while IFS= read -r PID; do
            PNAME=$(jq -r --arg id "$PID" '.prompts[$id].name // $id' "$RAW_FILE")
            echo "## $PID — $PNAME"
            echo ""
            jq -r --arg pid "$PID" '.results[$pid] // {} | keys[]' "$RAW_FILE" | while IFS= read -r MK; do
                MLABEL=$(jq -r --arg k "$MK" '.models[$k].label // $k' "$RAW_FILE")
                LAT=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].latency_ms // 0' "$RAW_FILE")
                TOKENS_IN=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].prompt_tokens // 0' "$RAW_FILE")
                TOKENS_OUT=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].completion_tokens // 0' "$RAW_FILE")
                MCOST=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].cost // 0' "$RAW_FILE")
                TRESULT=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].test_result // "N/A"' "$RAW_FILE")
                RESP=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].response // "(no response)"' "$RAW_FILE")
                MERR=$(jq -r --arg pid "$PID" --arg mk "$MK" '.results[$pid][$mk].error // null' "$RAW_FILE")

                echo "### $MLABEL"
                echo "Tokens: ${TOKENS_IN}→${TOKENS_OUT} | Latency: ${LAT}ms | Cost: \$${MCOST} | Test: ${TRESULT}"
                if [[ "$MERR" != "null" ]]; then
                    echo "**ERROR:** $MERR"
                fi
                echo ""
                echo '```'
                echo "$RESP"
                echo '```'
                echo ""
            done
        done
    } > "$CAT_FILE"
done <<< "$CATEGORIES"

# ── Generate summary ──
{
    echo "# Evaluation Summary"
    echo ""
    echo "- **Run ID**: $RUN_ID"
    echo "- **Tier**: $TIER"
    echo "- **Date**: $TIMESTAMP"
    echo "- **Total Cost**: \$${TOTAL_COST}"
    echo "- **Total Calls**: ${TOTAL_CALLS}"
    echo ""
    echo "## Models"
    echo ""
    echo "$ALL_MODEL_KEYS" | while IFS= read -r mk; do
        ml=$(jq -r --arg k "$mk" '.models[$k].label // $k' "$RAW_FILE")
        echo "- $ml ($mk)"
    done
    echo ""
    echo "## Prompts"
    echo ""
    echo "$TIER_PROMPT_IDS" | while IFS= read -r pid; do
        pn=$(jq -r --arg id "$pid" '.prompts[$id].name // $id' "$RAW_FILE")
        echo "- $pid: $pn"
    done
} > "$OUTPUT_DIR/00_summary.md"

# Write completed status
cat > "$STATUS_FILE" <<STATUSEOF
{"running": false, "run_id": "${RUN_ID}", "completed": true, "current": ${TOTAL_TASKS}, "total": ${TOTAL_TASKS}, "started_at": "${TIMESTAMP}", "completed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
STATUSEOF

echo "COMPLETE:${RUN_ID}"
