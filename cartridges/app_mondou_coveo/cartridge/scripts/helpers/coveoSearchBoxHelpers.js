'use strict';

var Site = require('dw/system/Site');
var URLUtils = require('dw/web/URLUtils');
var AnalyticsService = require('int_coveo_commerce/cartridge/scripts/services/AnalyticsService');
var CommerceApiService = require('int_coveo_commerce/cartridge/scripts/services/CommerceApiService');
var Logger = require('int_coveo_commerce/cartridge/scripts/helpers/Logger');

var DEFAULT_QUERY_SUGGEST_COUNT = 5;
var DEFAULT_PRODUCT_PREVIEW_COUNT = 4;
var MIN_QUERY_LENGTH = 2;
var SEARCH_BOX_RECOMMENDATION_SLOT_PREFERENCE = 'coveoCommerceSearchBoxRecommendationSlotId';

function getHttpRequest() {
    if (typeof request !== 'undefined') {
        return request;
    }

    return null;
}

function getHttpResponse() {
    if (typeof response !== 'undefined') {
        return response;
    }

    return null;
}

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function normalizeString(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '');
}

function cloneQuery(querystring) {
    var source = querystring || {};
    var target = {};

    Object.keys(source).forEach(function (key) {
        if (typeof source[key] === 'undefined' || source[key] === null) {
            return;
        }

        target[key] = String(source[key]);
    });

    return target;
}

function buildBaseParams(req) {
    var params = cloneQuery(req && req.querystring);

    params.query = normalizeString(params.q || params.query || '');
    params.currentCustomer = req.currentCustomer;
    params.session = req.session;
    params.request = getHttpRequest();
    params.response = getHttpResponse();

    return params;
}

function buildFallbackAnalytics() {
    return {
        clientId: AnalyticsService.ensureClientId(getHttpRequest(), getHttpResponse()) || null,
        responseId: null,
        queryUid: null
    };
}

function normalizeAnalytics(source) {
    var analytics = source && source.analytics ? source.analytics : {};
    var fallback = buildFallbackAnalytics();

    return {
        clientId: analytics.clientId || fallback.clientId,
        responseId: source && source.responseId ? source.responseId : analytics.responseId || null,
        queryUid: source && source.queryUid ? source.queryUid : analytics.queryUid || null
    };
}

function buildSearchUrl(query) {
    return URLUtils.url('Search-Show', 'q', query).toString();
}

function mapSuggestionItems(suggestionResult) {
    return (suggestionResult && suggestionResult.suggestions ? suggestionResult.suggestions : []).map(function (suggestion) {
        var value = normalizeString(suggestion && suggestion.value);

        if (!value) {
            return null;
        }

        return {
            value: value,
            url: buildSearchUrl(value)
        };
    }).filter(function (suggestion) {
        return !!suggestion;
    });
}

function mapPreviewProducts(products, limit) {
    return (products || []).slice(0, limit).map(function (product) {
        return {
            id: product && product.id ? product.id : '',
            name: product && product.name ? product.name : '',
            url: product && product.url ? product.url : '',
            image: product && product.image ? product.image : '',
            price: product && typeof product.price !== 'undefined' ? product.price : null,
            brand: product && product.brand ? product.brand : ''
        };
    });
}

function getRecommendationSlotId() {
    var site = Site.getCurrent();
    var slotId = site && site.getCustomPreferenceValue ?
        site.getCustomPreferenceValue(SEARCH_BOX_RECOMMENDATION_SLOT_PREFERENCE) :
        null;

    return slotId ? String(slotId) : '';
}

function buildBootstrapResponse(req) {
    var baseParams = buildBaseParams(req);
    var analytics = buildFallbackAnalytics();
    var popularSearches = [];
    var popularProducts = [];
    var popularSearchesError = null;
    var popularProductsError = null;
    var slotId = getRecommendationSlotId();
    var result;

    try {
        result = CommerceApiService.querySuggest({
            currentCustomer: baseParams.currentCustomer,
            request: baseParams.request,
            response: baseParams.response,
            coveoDebug: baseParams.coveoDebug,
            query: '',
            count: normalizeNumber(baseParams.count, DEFAULT_QUERY_SUGGEST_COUNT)
        });
        popularSearches = mapSuggestionItems(result);
        analytics = normalizeAnalytics(result);
    } catch (error) {
        popularSearchesError = error;
        Logger.warn('Mondou Coveo search box popular-search bootstrap failed.', {
            message: error.message
        });
    }

    if (!slotId) {
        Logger.debug('Mondou Coveo search box recommendation slot is not configured.', {
            preferenceId: SEARCH_BOX_RECOMMENDATION_SLOT_PREFERENCE
        });
    } else {
        try {
            result = CommerceApiService.recommendations({
                currentCustomer: baseParams.currentCustomer,
                request: baseParams.request,
                response: baseParams.response,
                coveoDebug: baseParams.coveoDebug,
                slotId: slotId
            });
            popularProducts = mapPreviewProducts(
                result.recommendations,
                normalizeNumber(baseParams.productCount, DEFAULT_PRODUCT_PREVIEW_COUNT)
            );
            analytics = normalizeAnalytics(result);
        } catch (error) {
            popularProductsError = error;
            Logger.warn('Mondou Coveo search box popular-product bootstrap failed.', {
                message: error.message,
                slotId: slotId
            });
        }
    }

    if (!popularSearches.length && !popularProducts.length && (popularSearchesError || popularProductsError)) {
        throw popularSearchesError || popularProductsError;
    }

    return {
        popularSearches: popularSearches,
        popularProducts: popularProducts,
        analytics: analytics
    };
}

function buildSuggestResponse(req) {
    var params = buildBaseParams(req);
    var query = params.query;
    var result;

    if (query.length < MIN_QUERY_LENGTH) {
        return {
            query: query,
            suggestions: [],
            analytics: buildFallbackAnalytics()
        };
    }

    result = CommerceApiService.querySuggest({
        currentCustomer: params.currentCustomer,
        request: params.request,
        response: params.response,
        coveoDebug: params.coveoDebug,
        query: query,
        count: normalizeNumber(params.count, DEFAULT_QUERY_SUGGEST_COUNT)
    });

    return {
        query: query,
        suggestions: mapSuggestionItems(result),
        analytics: normalizeAnalytics(result)
    };
}

function buildPreviewResponse(req) {
    var params = buildBaseParams(req);
    var query = params.query;
    var result;

    if (query.length < MIN_QUERY_LENGTH) {
        return {
            query: query,
            products: [],
            analytics: buildFallbackAnalytics()
        };
    }

    result = CommerceApiService.productSuggest({
        currentCustomer: params.currentCustomer,
        request: params.request,
        response: params.response,
        coveoDebug: params.coveoDebug,
        query: query
    });

    return {
        query: query,
        products: mapPreviewProducts(
            result.products,
            normalizeNumber(params.count, DEFAULT_PRODUCT_PREVIEW_COUNT)
        ),
        analytics: normalizeAnalytics(result)
    };
}

module.exports = {
    MIN_QUERY_LENGTH: MIN_QUERY_LENGTH,
    buildBootstrapResponse: buildBootstrapResponse,
    buildSuggestResponse: buildSuggestResponse,
    buildPreviewResponse: buildPreviewResponse
};
