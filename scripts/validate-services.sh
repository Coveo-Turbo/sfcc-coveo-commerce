#!/usr/bin/env bash

set -u

if [ -z "${COVEO_BASE_URL:-}" ]; then
    printf '%s\n' 'COVEO_BASE_URL is required.' >&2
    printf '%s\n' 'Example: export COVEO_BASE_URL="https://<host>/on/demandware.store/Sites-<site>-Site/fr_CA"' >&2
    exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' 'curl is required.' >&2
    exit 2
fi

BASE_URL="${COVEO_BASE_URL%/}"
QUERY="${COVEO_QUERY:-royal}"
FACET_ID="${COVEO_FACET_ID:-ec_brand}"
NUMBER_OF_VALUES="${COVEO_NUMBER_OF_VALUES:-5}"
FACET_CONTEXT="${COVEO_FACET_CONTEXT:-{\"custom\":{\"applyBestSellerSort\":true}}}"
TIMEOUT="${COVEO_TIMEOUT:-30}"
OUTPUT_DIR="${COVEO_OUTPUT_DIR:-${TMPDIR:-/tmp}/sfcc-coveo-validation-$(date +%Y%m%d-%H%M%S)}"
COOKIE_JAR="${COVEO_COOKIE_JAR:-${OUTPUT_DIR}/cookies.txt}"
PRINT_BODIES="${COVEO_PRINT_BODIES:-false}"
RECOMMENDATION_SLOT_ID="${COVEO_RECOMMENDATION_SLOT_ID:-}"
CATEGORY_ID="${COVEO_CATEGORY_ID:-}"
ROUTE_TARGET="${COVEO_ROUTE_TARGET:-demo}"
ROUTE_SEARCH_SHOW="${COVEO_ROUTE_SEARCH_SHOW:-Search-Show}"
ROUTE_INITIALIZE_ANALYTICS="${COVEO_ROUTE_INITIALIZE_ANALYTICS:-Search-InitializeAnalytics}"
ROUTE_SUGGEST="${COVEO_ROUTE_SUGGEST:-Search-Suggest}"
ROUTE_FACET="${COVEO_ROUTE_FACET:-Search-Facet}"
ROUTE_PRODUCT_SUGGESTIONS="${COVEO_ROUTE_PRODUCT_SUGGESTIONS:-Search-ProductSuggestions}"
ROUTE_RECOMMENDATIONS="${COVEO_ROUTE_RECOMMENDATIONS:-Search-Recommendations}"
ROUTE_CATEGORY_SHOW="${COVEO_ROUTE_CATEGORY_SHOW:-Category-Show}"

TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

mkdir -p "$OUTPUT_DIR"

print_body() {
    body_file="$1"

    if [ "$PRINT_BODIES" != 'true' ]; then
        return
    fi

    if command -v python3 >/dev/null 2>&1 && python3 -m json.tool "$body_file" >/dev/null 2>&1; then
        python3 -m json.tool "$body_file"
        return
    fi

    cat "$body_file"
    printf '\n'
}

run_request() {
    name="$1"
    expected_status="$2"
    route="$3"
    shift 3

    TOTAL=$((TOTAL + 1))
    body_file="${OUTPUT_DIR}/${name}.json"
    headers_file="${OUTPUT_DIR}/${name}.headers"

    status=$(curl \
        --silent \
        --show-error \
        --location \
        --max-time "$TIMEOUT" \
        --cookie "$COOKIE_JAR" \
        --cookie-jar "$COOKIE_JAR" \
        --dump-header "$headers_file" \
        --output "$body_file" \
        --write-out '%{http_code}' \
        --get "${BASE_URL}/${route}" \
        "$@")
    curl_status=$?

    if [ "$curl_status" -ne 0 ]; then
        FAILED=$((FAILED + 1))
        printf 'FAIL %-28s curl exit %s\n' "$name" "$curl_status"
        return
    fi

    if [ "$status" = "$expected_status" ]; then
        PASSED=$((PASSED + 1))
        printf 'PASS %-28s HTTP %s\n' "$name" "$status"
    else
        FAILED=$((FAILED + 1))
        printf 'FAIL %-28s expected HTTP %s, received %s\n' "$name" "$expected_status" "$status"
    fi

    print_body "$body_file"
}

skip_request() {
    name="$1"
    reason="$2"

    SKIPPED=$((SKIPPED + 1))
    printf 'SKIP %-28s %s\n' "$name" "$reason"
}

# Reads analytics.clientId from a saved JSON response body.
read_response_client_id() {
    python3 - "$1" <<'PY' 2>/dev/null
import json
import sys

try:
    with open(sys.argv[1]) as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(0)

analytics = payload.get('analytics') or {}
sys.stdout.write(str(analytics.get('clientId') or ''))
PY
}

# Reads the coveo_visitorId value from Set-Cookie response headers.
read_header_cookie() {
    grep -i 'set-cookie:[[:space:]]*coveo_visitorId=' "$1" 2>/dev/null |
        tail -1 |
        sed -E 's/.*coveo_visitorId=([^;[:space:]]*).*/\1/'
}

count_header_cookie() {
    count=$(grep -c -i 'set-cookie:[[:space:]]*coveo_visitorId=' "$1" 2>/dev/null)

    if [ -z "${count:-}" ]; then
        count=0
    fi

    printf '%s' "$count"
}

# Reads the coveo_visitorId value retained in a cookie jar.
read_jar_cookie() {
    grep -i 'coveo_visitorId' "$1" 2>/dev/null | tail -1 | awk '{print $NF}'
}

# Issues a request against an isolated cookie jar so first-visit identity
# behavior can be observed independently of the main matrix session.
isolated_request() {
    name="$1"
    jar="$2"
    route="$3"
    shift 3

    curl \
        --silent \
        --show-error \
        --location \
        --max-time "$TIMEOUT" \
        --cookie "$jar" \
        --cookie-jar "$jar" \
        --dump-header "${OUTPUT_DIR}/${name}.headers" \
        --output "${OUTPUT_DIR}/${name}.json" \
        --write-out '%{http_code}' \
        --get "${BASE_URL}/${route}" \
        "$@"
}

# Sends the retained cookie without writing the jar. Concurrent requests must
# not share a jar for writing, because simultaneous writes corrupt it.
isolated_request_readonly() {
    name="$1"
    jar="$2"
    route="$3"
    shift 3

    curl \
        --silent \
        --show-error \
        --location \
        --max-time "$TIMEOUT" \
        --cookie "$jar" \
        --dump-header "${OUTPUT_DIR}/${name}.headers" \
        --output "${OUTPUT_DIR}/${name}.json" \
        --write-out '%{http_code}' \
        --get "${BASE_URL}/${route}" \
        "$@"
}

report_check() {
    name="$1"
    outcome="$2"
    detail="$3"

    TOTAL=$((TOTAL + 1))

    if [ "$outcome" = 'pass' ]; then
        PASSED=$((PASSED + 1))
        printf 'PASS %-28s %s\n' "$name" "$detail"
    else
        FAILED=$((FAILED + 1))
        printf 'FAIL %-28s %s\n' "$name" "$detail"
    fi
}

# Compares identifiers without printing full visitor values.
fingerprint() {
    value="$1"

    if [ -z "$value" ]; then
        printf '%s' '<empty>'
        return
    fi

    printf '%s' "$(printf '%s' "$value" | cut -c1-8)..."
}

run_client_id_continuity_checks() {
    if ! command -v python3 >/dev/null 2>&1; then
        skip_request 'client-id-continuity' 'python3 is required to parse analytics.clientId'
        return
    fi

    preview_jar="${OUTPUT_DIR}/continuity-preview-cookies.txt"
    init_jar="${OUTPUT_DIR}/continuity-init-cookies.txt"
    : > "$preview_jar"
    : > "$init_jar"

    # Defect 1: a first-visit product suggestion must report the same client ID
    # that it stores in the visitor cookie.
    preview_status=$(isolated_request 'continuity-first-preview' "$preview_jar" "$ROUTE_PRODUCT_SUGGESTIONS" \
        --data-urlencode "q=${QUERY}")
    preview_client_id=$(read_response_client_id "${OUTPUT_DIR}/continuity-first-preview.json")
    preview_cookie=$(read_header_cookie "${OUTPUT_DIR}/continuity-first-preview.headers")
    preview_cookie_count=$(count_header_cookie "${OUTPUT_DIR}/continuity-first-preview.headers")

    if [ "$preview_status" != '200' ]; then
        report_check 'first-preview-identity' 'fail' "expected HTTP 200, received ${preview_status}"
    elif [ -z "$preview_client_id" ]; then
        skip_request 'first-preview-identity' 'no analytics.clientId returned; analytics may be disabled'
    elif [ "$preview_client_id" = "$preview_cookie" ]; then
        report_check 'first-preview-identity' 'pass' "response clientId matches visitor cookie ($(fingerprint "$preview_client_id"))"
    else
        report_check 'first-preview-identity' 'fail' \
            "response clientId $(fingerprint "$preview_client_id") does not match cookie $(fingerprint "$preview_cookie")"
    fi

    if [ "${preview_cookie_count:-0}" -gt 1 ]; then
        report_check 'first-preview-single-cookie' 'fail' "received ${preview_cookie_count} coveo_visitorId headers"
    else
        report_check 'first-preview-single-cookie' 'pass' "received ${preview_cookie_count:-0} coveo_visitorId header(s)"
    fi

    # Initialization route must establish the cookie it reports.
    init_status=$(isolated_request 'continuity-initialize' "$init_jar" "$ROUTE_INITIALIZE_ANALYTICS")
    init_client_id=$(read_response_client_id "${OUTPUT_DIR}/continuity-initialize.json")
    init_cookie=$(read_jar_cookie "$init_jar")

    if [ "$init_status" != '200' ]; then
        report_check 'initialize-analytics' 'fail' "expected HTTP 200, received ${init_status}"
        return
    fi

    if [ -z "$init_client_id" ]; then
        skip_request 'initialize-analytics' 'no analytics.clientId returned; analytics may be disabled'
        return
    fi

    if [ "$init_client_id" = "$init_cookie" ]; then
        report_check 'initialize-analytics' 'pass' "established visitor cookie ($(fingerprint "$init_client_id"))"
    else
        report_check 'initialize-analytics' 'fail' \
            "response clientId $(fingerprint "$init_client_id") does not match cookie $(fingerprint "$init_cookie")"
    fi

    # Defect 2: once identity exists, concurrent suggestions must reuse it and
    # must not establish a competing visitor cookie.
    isolated_request_readonly 'continuity-concurrent-suggest' "$init_jar" "$ROUTE_SUGGEST" \
        --data-urlencode "q=${QUERY}" \
        --data-urlencode "count=${NUMBER_OF_VALUES}" >/dev/null &
    suggest_pid=$!
    isolated_request_readonly 'continuity-concurrent-preview' "$init_jar" "$ROUTE_PRODUCT_SUGGESTIONS" \
        --data-urlencode "q=${QUERY}" >/dev/null &
    preview_pid=$!
    wait "$suggest_pid"
    wait "$preview_pid"

    concurrent_suggest_id=$(read_response_client_id "${OUTPUT_DIR}/continuity-concurrent-suggest.json")
    concurrent_preview_id=$(read_response_client_id "${OUTPUT_DIR}/continuity-concurrent-preview.json")

    if [ "$concurrent_suggest_id" = "$init_client_id" ] && [ "$concurrent_preview_id" = "$init_client_id" ]; then
        report_check 'concurrent-suggest-identity' 'pass' "both responses reused $(fingerprint "$init_client_id")"
    else
        report_check 'concurrent-suggest-identity' 'fail' \
            "suggest $(fingerprint "$concurrent_suggest_id") and preview $(fingerprint "$concurrent_preview_id") expected $(fingerprint "$init_client_id")"
    fi

    suggest_cookie_count=$(count_header_cookie "${OUTPUT_DIR}/continuity-concurrent-suggest.headers")
    preview_cookie_count_after_init=$(count_header_cookie "${OUTPUT_DIR}/continuity-concurrent-preview.headers")
    reissued=$((suggest_cookie_count + preview_cookie_count_after_init))

    if [ "$reissued" -eq 0 ]; then
        report_check 'concurrent-no-cookie-reissue' 'pass' 'no visitor cookie was replaced'
    else
        report_check 'concurrent-no-cookie-reissue' 'fail' "${reissued} coveo_visitorId header(s) reissued"
    fi
}

printf 'Coveo Commerce validation\n'
printf 'Base URL: %s\n' "$BASE_URL"
printf 'Route target: %s\n' "$ROUTE_TARGET"
printf 'Output:   %s\n\n' "$OUTPUT_DIR"

run_request 'query-suggest-empty' 200 "$ROUTE_SUGGEST" \
    --data-urlencode 'q=' \
    --data-urlencode "count=${NUMBER_OF_VALUES}"

run_request 'query-suggest-typed' 200 "$ROUTE_SUGGEST" \
    --data-urlencode "q=${QUERY}" \
    --data-urlencode "count=${NUMBER_OF_VALUES}"

run_request 'facet-search-empty' 200 "$ROUTE_FACET" \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}"

run_request 'facet-search-custom-context' 200 "$ROUTE_FACET" \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}" \
    --data-urlencode "context=${FACET_CONTEXT}"

run_request 'facet-search-typed' 200 "$ROUTE_FACET" \
    --data-urlencode "q=${QUERY}" \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}"

run_request 'product-suggestions' 200 "$ROUTE_PRODUCT_SUGGESTIONS" \
    --data-urlencode "q=${QUERY}"

run_request 'facet-invalid-count' 400 "$ROUTE_FACET" \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode 'numberOfValues=5junk'

run_request 'search-page' 200 "$ROUTE_SEARCH_SHOW" \
    --data-urlencode "q=${QUERY}"

if [ -n "$RECOMMENDATION_SLOT_ID" ]; then
    run_request 'recommendations' 200 "$ROUTE_RECOMMENDATIONS" \
        --data-urlencode "slotId=${RECOMMENDATION_SLOT_ID}"
else
    skip_request 'recommendations' 'set COVEO_RECOMMENDATION_SLOT_ID to enable'
fi

if [ -n "$CATEGORY_ID" ]; then
    run_request 'category-listing' 200 "$ROUTE_CATEGORY_SHOW" \
        --data-urlencode "cgid=${CATEGORY_ID}"
else
    skip_request 'category-listing' 'set COVEO_CATEGORY_ID to enable'
fi

printf '\nClient ID continuity\n'
run_client_id_continuity_checks

printf '\nResults: %s passed, %s failed, %s skipped, %s requests\n' "$PASSED" "$FAILED" "$SKIPPED" "$TOTAL"
printf 'Response bodies and headers: %s\n' "$OUTPUT_DIR"

if [ "$FAILED" -ne 0 ]; then
    exit 1
fi
