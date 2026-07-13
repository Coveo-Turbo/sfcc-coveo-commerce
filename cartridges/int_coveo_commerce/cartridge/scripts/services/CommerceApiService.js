'use strict';

var SearchResult = require('*/cartridge/models/SearchResult');
var ListingResult = require('*/cartridge/models/ListingResult');
var RecommendationResult = require('*/cartridge/models/RecommendationResult');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');
var QueryBuilder = require('*/cartridge/scripts/helpers/QueryBuilder');
var SearchResultMapper = require('*/cartridge/scripts/mappers/SearchResultMapper');
var ListingResultMapper = require('*/cartridge/scripts/mappers/ListingResultMapper');
var RecommendationMapper = require('*/cartridge/scripts/mappers/RecommendationMapper');
var ProductSuggestionMapper = require('*/cartridge/scripts/mappers/ProductSuggestionMapper');
var AnalyticsService = require('*/cartridge/scripts/services/AnalyticsService');
var CoveoCommerceHttpService = require('*/cartridge/scripts/services/CoveoCommerceHttpService');

var ENDPOINTS = {
    SEARCH: 'search',
    LISTING: 'listing',
    QUERY_SUGGEST: 'search/querySuggest',
    PRODUCT_SUGGEST: 'search/productSuggest',
    RECOMMENDATIONS: 'recommendations'
};

function validateConfiguration(settings) {
    var missing = Config.validateSettings(settings);

    if (missing.length) {
        throw new Error('Missing required Coveo Commerce configuration: ' + missing.join(', '));
    }
}

function validatePayload(operationName, payload) {
    var missing = [];

    if (!payload.language) {
        missing.push('language');
    }

    if (!payload.country) {
        missing.push('country');
    }

    if (!payload.currency) {
        missing.push('currency');
    }

    if (missing.length) {
        throw new Error(
            'Missing required Coveo Commerce request context for ' + operationName + ': ' +
            missing.join(', ') +
            '. Provide them through the storefront request, CommerceApiService params, or site preferences.'
        );
    }
}

function buildAnalyticsContext(params) {
    var requestParams = params || {};

    return AnalyticsService.buildRequestContext(
        requestParams.request || null,
        requestParams.response || null,
        {
            searchHub: requestParams.searchHub,
            pipeline: requestParams.pipeline
        }
    );
}

function execute(operationName, endpointPath, payload, authContext, settings) {
    return CoveoCommerceHttpService.request({
        name: operationName,
        endpointPath: endpointPath,
        authContext: authContext,
        body: payload,
        settings: settings,
        retryCount: settings.retryCount,
        parseJson: true
    });
}

function mapFacetSelections(values) {
    return (values || []).map(function (value) {
        if (typeof value === 'string') {
            return value;
        }

        if (typeof value.value !== 'undefined') {
            return String(value.value);
        }

        if (typeof value.start !== 'undefined' || typeof value.end !== 'undefined') {
            return {
                start: value.start,
                end: value.end,
                endInclusive: value.endInclusive !== false
            };
        }

        return '';
    }).filter(function (value) {
        if (typeof value === 'string') {
            return !!value;
        }

        return !!value;
    });
}

function summarizeRequestFacets(facets) {
    return (facets || []).map(function (facet) {
        return {
            facetId: facet.facetId || facet.field || '',
            field: facet.field || '',
            type: facet.type || '',
            selectedValues: mapFacetSelections(facet.values)
        };
    });
}

function summarizeRequestContext(context) {
    var source = context || {};
    var view = source.view || {};
    var cart = source.cart || [];
    var user = source.user || {};

    return {
        viewUrl: view.url || '',
        capture: source.capture === true,
        cartSize: typeof cart.length === 'number' ? cart.length : 0,
        hasUserAgent: !!user.userAgent,
        hasReferrer: !!user.referrer
    };
}

function summarizeResponseFacets(rawFacets) {
    return (rawFacets || []).map(function (facet) {
        var values = facet.values || facet.options || [];
        var selectedValues = values.filter(function (value) {
            var state = String(value && value.state ? value.state : '').toLowerCase();

            return state === 'selected' || value.selected === true;
        }).map(function (value) {
            if (typeof value.displayValue !== 'undefined' && value.displayValue !== null && value.displayValue !== '') {
                return String(value.displayValue);
            }

            if (typeof value.value !== 'undefined' && value.value !== null && value.value !== '') {
                return String(value.value);
            }

            if (typeof value.name !== 'undefined' && value.name !== null && value.name !== '') {
                return String(value.name);
            }

            return '';
        }).filter(function (value) {
            return !!value;
        });

        return {
            facetId: facet.facetId || facet.id || facet.field || '',
            field: facet.field || '',
            label: facet.displayName || facet.label || '',
            valuesCount: values.length,
            selectedValues: selectedValues
        };
    });
}

function resolveDebugTotal(rawResponse, mappedResponse) {
    var pagination = rawResponse && rawResponse.pagination ? rawResponse.pagination : {};

    if (typeof pagination.totalEntries === 'number') {
        return pagination.totalEntries;
    }

    if (typeof pagination.totalProducts === 'number') {
        return pagination.totalProducts;
    }

    if (mappedResponse && mappedResponse.pagination && typeof mappedResponse.pagination.total === 'number') {
        return mappedResponse.pagination.total;
    }

    if (typeof rawResponse.totalCount === 'number') {
        return rawResponse.totalCount;
    }

    return null;
}

function buildDebugSnapshot(operationName, endpointPath, payload, response, mappedResponse) {
    var rawResponse = response && response.data ? response.data : {};
    var rawFacets = rawResponse.facets || rawResponse.filters || [];

    return {
        operation: operationName,
        endpoint: endpointPath,
        request: {
            trackingId: payload.trackingId || '',
            clientId: payload.clientId || '',
            language: payload.language || '',
            country: payload.country || '',
            currency: payload.currency || '',
            query: payload.query || '',
            categoryId: payload.categoryId || '',
            productId: payload.productId || '',
            slotId: payload.slotId || '',
            page: typeof payload.page === 'number' ? payload.page : null,
            perPage: typeof payload.perPage === 'number' ? payload.perPage : null,
            count: typeof payload.count === 'number' ? payload.count : null,
            sort: payload.sort || null,
            facets: summarizeRequestFacets(payload.facets),
            context: summarizeRequestContext(payload.context)
        },
        rawRequest: payload,
        response: {
            statusCode: response && typeof response.statusCode === 'number' ? response.statusCode : null,
            duration: response && typeof response.duration === 'number' ? response.duration : null,
            responseId: mappedResponse && mappedResponse.responseId ? mappedResponse.responseId : (rawResponse.responseId || ''),
            queryUid: mappedResponse && mappedResponse.queryUid ? mappedResponse.queryUid : (rawResponse.queryUid || ''),
            total: resolveDebugTotal(rawResponse, mappedResponse),
            productCount: mappedResponse && mappedResponse.products ? mappedResponse.products.length : 0,
            recommendationCount: mappedResponse && mappedResponse.recommendations ? mappedResponse.recommendations.length : 0,
            suggestionCount: rawResponse && rawResponse.completions ? rawResponse.completions.length : ((rawResponse.suggestions || rawResponse.items || []).length || 0),
            facetCount: rawFacets.length,
            facets: summarizeResponseFacets(rawFacets)
        },
        rawResponse: rawResponse
    };
}

function normalizeSuggestions(response, analyticsContext) {
    var source = response || {};
    var suggestions = source.completions || source.suggestions || source.items || [];

    function normalizeSuggestionValue(item) {
        var value = item.expression || item.highlighted || item.value || item.query || item.label || '';

        return String(value)
            .replace(/\[/g, '')
            .replace(/\]/g, '')
            .replace(/[{}()]/g, '')
            .replace(/^\s+|\s+$/g, '');
    }

    return {
        suggestions: suggestions.map(function (item) {
            if (typeof item === 'string') {
                return {
                    value: item
                };
            }

            return {
                value: normalizeSuggestionValue(item),
                raw: item
            };
        }).filter(function (item) {
            return !!item.value;
        }),
        responseId: source.responseId || '',
        queryUid: source.queryUid || '',
        analytics: {
            clientId: analyticsContext.clientId || '',
            responseId: source.responseId || '',
            queryUid: source.queryUid || '',
            searchHub: analyticsContext.searchHub || '',
            pipeline: analyticsContext.pipeline || ''
        }
    };
}

function search(params) {
    var requestParams = params || {};
    var settings = Config.getSettings();
    var analyticsContext;
    var payload;
    var response;
    var mapped;

    validateConfiguration(settings);
    analyticsContext = buildAnalyticsContext(requestParams);
    payload = QueryBuilder.buildSearchPayload(requestParams, settings, analyticsContext);
    validatePayload('search', payload);
    response = execute('search', ENDPOINTS.SEARCH, payload, requestParams, settings);
    mapped = SearchResultMapper.map(response.data, requestParams, analyticsContext);
    if (requestParams.coveoDebug) {
        mapped.debug = buildDebugSnapshot('search', ENDPOINTS.SEARCH, payload, response, mapped);
    }

    Logger.debug('Mapped Coveo search response.', {
        query: payload.query,
        responseId: mapped.responseId
    });

    return new SearchResult(mapped);
}

function listing(params) {
    var requestParams = params || {};
    var settings = Config.getSettings();
    var analyticsContext;
    var payload;
    var response;
    var mapped;

    validateConfiguration(settings);
    analyticsContext = buildAnalyticsContext(requestParams);
    payload = QueryBuilder.buildListingPayload(requestParams, settings, analyticsContext);
    validatePayload('listing', payload);
    response = execute('listing', ENDPOINTS.LISTING, payload, requestParams, settings);
    mapped = ListingResultMapper.map(response.data, requestParams, analyticsContext);
    if (requestParams.coveoDebug) {
        mapped.debug = buildDebugSnapshot('listing', ENDPOINTS.LISTING, payload, response, mapped);
    }

    Logger.debug('Mapped Coveo listing response.', {
        categoryId: payload.categoryId,
        responseId: mapped.responseId
    });

    return new ListingResult(mapped);
}

function querySuggest(params) {
    var requestParams = params || {};
    var settings = Config.getSettings();
    var analyticsContext;
    var payload;
    var response;

    validateConfiguration(settings);
    analyticsContext = buildAnalyticsContext(requestParams);
    payload = QueryBuilder.buildQuerySuggestPayload(requestParams, settings, analyticsContext);
    validatePayload('querySuggest', payload);
    response = execute('querySuggest', ENDPOINTS.QUERY_SUGGEST, payload, requestParams, settings);

    return normalizeSuggestions(response.data, analyticsContext);
}

function productSuggest(params) {
    var requestParams = params || {};
    var settings = Config.getSettings();
    var analyticsContext;
    var payload;
    var response;

    validateConfiguration(settings);
    analyticsContext = buildAnalyticsContext(requestParams);
    payload = QueryBuilder.buildProductSuggestPayload(requestParams, settings, analyticsContext);
    validatePayload('productSuggest', payload);
    response = execute('productSuggest', ENDPOINTS.PRODUCT_SUGGEST, payload, requestParams, settings);

    return ProductSuggestionMapper.map(response.data, requestParams, analyticsContext);
}

function recommendations(params) {
    var requestParams = params || {};
    var settings = Config.getSettings();
    var analyticsContext;
    var payload;
    var response;
    var mapped;

    validateConfiguration(settings);
    analyticsContext = buildAnalyticsContext(requestParams);
    payload = QueryBuilder.buildRecommendationsPayload(requestParams, settings, analyticsContext);
    validatePayload('recommendations', payload);
    response = execute('recommendations', ENDPOINTS.RECOMMENDATIONS, payload, requestParams, settings);
    mapped = RecommendationMapper.map(response.data, requestParams, analyticsContext);
    if (requestParams.coveoDebug) {
        mapped.debug = buildDebugSnapshot('recommendations', ENDPOINTS.RECOMMENDATIONS, payload, response, mapped);
    }

    return new RecommendationResult(mapped);
}

module.exports = {
    search: search,
    listing: listing,
    querySuggest: querySuggest,
    productSuggest: productSuggest,
    recommendations: recommendations
};
