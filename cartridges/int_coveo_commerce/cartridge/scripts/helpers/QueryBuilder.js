'use strict';

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function normalizeArray(value) {
    if (!value) {
        return [];
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
        return value;
    }

    if (typeof value === 'string') {
        if (value.charAt(0) === '[') {
            return parseJson(value, []);
        }

        return value.split(',').map(function (entry) {
            return entry.replace(/^\s+|\s+$/g, '');
        }).filter(function (entry) {
            return entry;
        });
    }

    return [value];
}

function normalizeObject(value) {
    if (!value) {
        return {};
    }

    if (typeof value === 'object') {
        return value;
    }

    return parseJson(value, {});
}

function buildBaseContext(params, config, analyticsContext) {
    var requestContext = normalizeObject(params.context);

    requestContext.organizationId = config.organizationId;
    requestContext.catalog = params.catalog || config.defaultCatalog;
    requestContext.locale = params.locale || config.locale;
    requestContext.currency = params.currency || config.currency;
    requestContext.searchHub = params.searchHub || analyticsContext.searchHub || config.searchHub;
    requestContext.pipeline = params.pipeline || analyticsContext.pipeline || config.pipeline;
    requestContext.clientId = analyticsContext.clientId;

    return requestContext;
}

function buildSearchPayload(params, config, analyticsContext) {
    return {
        query: params.q || params.query || '',
        page: normalizeNumber(params.page, 1),
        perPage: normalizeNumber(params.perPage || params.sz, 12),
        sort: params.sort || '',
        facets: normalizeArray(params.facets),
        filters: normalizeObject(params.filters || params.refinements),
        context: buildBaseContext(params, config, analyticsContext)
    };
}

function buildListingPayload(params, config, analyticsContext) {
    return {
        categoryId: params.categoryId || params.cgid || '',
        page: normalizeNumber(params.page, 1),
        perPage: normalizeNumber(params.perPage || params.sz, 12),
        sort: params.sort || '',
        facets: normalizeArray(params.facets),
        filters: normalizeObject(params.filters || params.refinements),
        context: buildBaseContext(params, config, analyticsContext)
    };
}

function buildQuerySuggestPayload(params, config, analyticsContext) {
    return {
        query: params.q || params.query || '',
        count: normalizeNumber(params.count, 5),
        context: buildBaseContext(params, config, analyticsContext)
    };
}

function buildRecommendationsPayload(params, config, analyticsContext) {
    return {
        slotId: params.slotId || '',
        productId: params.productId || params.pid || '',
        context: buildBaseContext(params, config, analyticsContext)
    };
}

module.exports = {
    buildSearchPayload: buildSearchPayload,
    buildListingPayload: buildListingPayload,
    buildQuerySuggestPayload: buildQuerySuggestPayload,
    buildRecommendationsPayload: buildRecommendationsPayload
};
