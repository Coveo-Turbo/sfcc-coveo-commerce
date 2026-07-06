'use strict';

function buildBasePayload(result, context) {
    var analytics = result && result.analytics ? result.analytics : {};
    var details = context || {};

    return {
        responseId: result && result.responseId ? result.responseId : analytics.responseId || '',
        clientId: analytics.clientId || '',
        searchHub: details.searchHub || analytics.searchHub || '',
        pipeline: details.pipeline || analytics.pipeline || ''
    };
}

function buildSearchResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoSearchResponse';
    payload.query = context && context.query ? context.query : '';
    payload.queryUid = result && result.queryUid ? result.queryUid : '';

    return payload;
}

function buildListingResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoListingResponse';
    payload.categoryId = context && context.categoryId ? context.categoryId : '';

    return payload;
}

function buildRecommendationResponseEvent(result, context) {
    var payload = buildBasePayload(result, context);

    payload.event = 'coveoRecommendationResponse';
    payload.recommendationId = context && context.slotId ? context.slotId : '';
    payload.productId = context && context.productId ? context.productId : '';

    return payload;
}

module.exports = {
    buildSearchResponseEvent: buildSearchResponseEvent,
    buildListingResponseEvent: buildListingResponseEvent,
    buildRecommendationResponseEvent: buildRecommendationResponseEvent
};
