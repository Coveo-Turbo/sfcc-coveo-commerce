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

printf 'Coveo Commerce validation\n'
printf 'Base URL: %s\n' "$BASE_URL"
printf 'Output:   %s\n\n' "$OUTPUT_DIR"

run_request 'query-suggest-empty' 200 'Search-Suggest' \
    --data-urlencode 'q=' \
    --data-urlencode "count=${NUMBER_OF_VALUES}"

run_request 'query-suggest-typed' 200 'Search-Suggest' \
    --data-urlencode "q=${QUERY}" \
    --data-urlencode "count=${NUMBER_OF_VALUES}"

run_request 'facet-search-empty' 200 'Search-Facet' \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}"

run_request 'facet-search-custom-context' 200 'Search-Facet' \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}" \
    --data-urlencode "context=${FACET_CONTEXT}"

run_request 'facet-search-typed' 200 'Search-Facet' \
    --data-urlencode "q=${QUERY}" \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode "numberOfValues=${NUMBER_OF_VALUES}"

run_request 'product-suggestions' 200 'Search-ProductSuggestions' \
    --data-urlencode "q=${QUERY}"

run_request 'facet-invalid-count' 400 'Search-Facet' \
    --data-urlencode 'q=' \
    --data-urlencode "facetId=${FACET_ID}" \
    --data-urlencode 'numberOfValues=5junk'

run_request 'search-page' 200 'Search-Show' \
    --data-urlencode "q=${QUERY}"

if [ -n "$RECOMMENDATION_SLOT_ID" ]; then
    run_request 'recommendations' 200 'Search-Recommendations' \
        --data-urlencode "slotId=${RECOMMENDATION_SLOT_ID}"
else
    skip_request 'recommendations' 'set COVEO_RECOMMENDATION_SLOT_ID to enable'
fi

if [ -n "$CATEGORY_ID" ]; then
    run_request 'category-listing' 200 'Category-Show' \
        --data-urlencode "cgid=${CATEGORY_ID}"
else
    skip_request 'category-listing' 'set COVEO_CATEGORY_ID to enable'
fi

printf '\nResults: %s passed, %s failed, %s skipped, %s requests\n' "$PASSED" "$FAILED" "$SKIPPED" "$TOTAL"
printf 'Response bodies and headers: %s\n' "$OUTPUT_DIR"

if [ "$FAILED" -ne 0 ]; then
    exit 1
fi
