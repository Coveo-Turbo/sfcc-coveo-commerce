'use strict';

function buildBasePayload(result, context) {
    var analytics = result && result.analytics ? result.analytics : {};
    var details = context || {};

    return {
        responseId: result && result.responseId ? result.responseId : analytics.responseId || '',
        clientId: analytics.clientId || '',
        searchHub: details.searchHub || analytics.searchHub || '',
        pipeline: details.pipeline || analytics.pipeline || '',
        surface: details.surface || '',
        source: details.source || '',
        searchQueryUid: result && result.queryUid ? result.queryUid : analytics.queryUid || ''
    };
}

function buildSearchResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoSearchResponse';
    payload.operation = 'search';
    payload.query = context && context.query ? context.query : '';
    payload.queryUid = result && result.queryUid ? result.queryUid : '';

    return payload;
}

function buildListingResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoListingResponse';
    payload.operation = 'listing';
    payload.categoryId = context && context.categoryId ? context.categoryId : '';

    return payload;
}

function buildRecommendationResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoRecommendationResponse';
    payload.operation = 'recommendation';
    payload.recommendationId = context && context.slotId ? context.slotId : '';
    payload.productId = context && context.productId ? context.productId : '';

    return payload;
}

function buildQuerySuggestResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoQuerySuggestResponse';
    payload.operation = 'querySuggest';
    payload.query = context && context.query ? context.query : '';
    payload.queryUid = result && result.queryUid ? result.queryUid : '';

    return payload;
}

function buildProductSuggestResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoProductSuggestResponse';
    payload.operation = 'productSuggest';
    payload.query = context && context.query ? context.query : '';
    payload.queryUid = result && result.queryUid ? result.queryUid : '';

    return payload;
}

module.exports = {
    buildSearchResponseEvent: buildSearchResponseEvent,
    buildListingResponseEvent: buildListingResponseEvent,
    buildRecommendationResponseEvent: buildRecommendationResponseEvent,
    buildQuerySuggestResponseEvent: buildQuerySuggestResponseEvent,
    buildProductSuggestResponseEvent: buildProductSuggestResponseEvent
};
