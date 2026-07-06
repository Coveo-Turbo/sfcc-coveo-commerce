'use strict';

var SearchResult = require('*/cartridge/models/SearchResult');
var ListingResult = require('*/cartridge/models/ListingResult');
var RecommendationResult = require('*/cartridge/models/RecommendationResult');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');
var QueryBuilder = require('*/cartridge/scripts/helpers/QueryBuilder');
var UrlHelper = require('*/cartridge/scripts/helpers/UrlHelper');
var SearchResultMapper = require('*/cartridge/scripts/mappers/SearchResultMapper');
var ListingResultMapper = require('*/cartridge/scripts/mappers/ListingResultMapper');
var RecommendationMapper = require('*/cartridge/scripts/mappers/RecommendationMapper');
var AnalyticsService = require('*/cartridge/scripts/services/AnalyticsService');
var HttpClient = require('*/cartridge/scripts/services/HttpClient');

var ENDPOINTS = {
    SEARCH: 'search',
    LISTING: 'listing',
    QUERY_SUGGEST: 'query-suggest',
    RECOMMENDATIONS: 'recommendations'
};

function getHttpRequest(params) {
    if (params && params.request) {
        return params.request;
    }

    if (typeof request !== 'undefined') {
        return request;
    }

    return null;
}

function getHttpResponse(params) {
    if (params && params.response) {
        return params.response;
    }

    if (typeof response !== 'undefined') {
        return response;
    }

    return null;
}

function validateConfiguration(settings) {
    var missing = Config.validateSettings(settings);

    if (missing.length) {
        throw new Error('Missing required Coveo Commerce configuration: ' + missing.join(', '));
    }
}

function buildAnalyticsContext(params) {
    return AnalyticsService.buildRequestContext(
        getHttpRequest(params),
        getHttpResponse(params),
        {
            searchHub: params.searchHub,
            pipeline: params.pipeline
        }
    );
}

function execute(operationName, endpointPath, payload, settings) {
    return HttpClient.request({
        name: operationName,
        method: 'POST',
        url: UrlHelper.buildEndpoint(settings.apiEndpoint, endpointPath),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        body: payload,
        timeout: settings.timeoutMillis,
        retryCount: settings.retryCount,
        parseJson: true
    });
}

function normalizeSuggestions(response, analyticsContext) {
    var source = response || {};
    var suggestions = source.suggestions || source.items || [];

    return {
        suggestions: suggestions.map(function (item) {
            if (typeof item === 'string') {
                return {
                    value: item
                };
            }

            return {
                value: item.value || item.query || item.label || '',
                raw: item
            };
        }),
        responseId: source.responseId || '',
        analytics: {
            clientId: analyticsContext.clientId || '',
            responseId: source.responseId || '',
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
    response = execute('search', ENDPOINTS.SEARCH, payload, settings);
    mapped = SearchResultMapper.map(response.data, requestParams, analyticsContext);

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
    response = execute('listing', ENDPOINTS.LISTING, payload, settings);
    mapped = ListingResultMapper.map(response.data, requestParams, analyticsContext);

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
    response = execute('querySuggest', ENDPOINTS.QUERY_SUGGEST, payload, settings);

    return normalizeSuggestions(response.data, analyticsContext);
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
    response = execute('recommendations', ENDPOINTS.RECOMMENDATIONS, payload, settings);
    mapped = RecommendationMapper.map(response.data, requestParams, analyticsContext);

    return new RecommendationResult(mapped);
}

module.exports = {
    search: search,
    listing: listing,
    querySuggest: querySuggest,
    recommendations: recommendations
};
