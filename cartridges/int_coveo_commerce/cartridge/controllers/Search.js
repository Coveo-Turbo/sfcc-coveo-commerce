'use strict';
/* global request, response */

var server = require('server');
var CommerceApiService = require('*/cartridge/scripts/services/CommerceApiService');
var SearchResult = require('*/cartridge/models/SearchResult');
var GtmHelper = require('*/cartridge/scripts/helpers/GtmHelper');
var Logger = require('*/cartridge/scripts/helpers/Logger');

function buildParams(req) {
    var query = req.querystring || {};
    var params = {};

    Object.keys(query).forEach(function (key) {
        params[key] = query[key];
    });

    params.currentCustomer = req.currentCustomer;
    params.session = req.session;
    params.request = request;
    params.response = response;

    return params;
}

function renderPageError(res, error) {
    Logger.error('Coveo search controller failed.', {
        message: error.message,
        stack: error.stack
    });

    res.setStatusCode(502);
    res.setViewData({
        coveoSearch: new SearchResult(),
        coveoError: {
            message: error.message
        }
    });
    res.render('search/searchResults');
}

server.get('Show', function (req, res, next) {
    var params = buildParams(req);
    var result;

    try {
        result = CommerceApiService.search(params);

        res.setViewData({
            coveoSearch: result,
            coveoAnalytics: result.analytics,
            coveoDataLayer: GtmHelper.buildSearchResponseEvent(result, {
                query: params.q || params.query,
                searchHub: result.analytics.searchHub,
                pipeline: result.analytics.pipeline
            })
        });
        res.render('search/searchResults');
    } catch (error) {
        renderPageError(res, error);
    }

    return next();
});

server.get('Suggest', function (req, res, next) {
    var params = buildParams(req);
    var suggestions;

    try {
        suggestions = CommerceApiService.querySuggest(params);
        res.json({
            suggestions: suggestions.suggestions,
            responseId: suggestions.responseId,
            queryUid: suggestions.queryUid,
            analytics: suggestions.analytics,
            dataLayer: GtmHelper.buildQuerySuggestResponseEvent(suggestions, {
                query: params.q || params.query,
                searchHub: suggestions.analytics.searchHub,
                pipeline: suggestions.analytics.pipeline
            })
        });
    } catch (error) {
        Logger.error('Coveo query suggest failed.', {
            message: error.message
        });

        res.setStatusCode(502);
        res.json({
            error: true,
            message: 'Unable to retrieve Coveo query suggestions.'
        });
    }

    return next();
});

server.get('ProductSuggestions', function (req, res, next) {
    var params = buildParams(req);
    var suggestions;

    try {
        suggestions = CommerceApiService.productSuggest(params);
        res.json({
            products: suggestions.products,
            responseId: suggestions.responseId,
            queryUid: suggestions.queryUid,
            analytics: suggestions.analytics,
            dataLayer: GtmHelper.buildProductSuggestResponseEvent(suggestions, {
                query: params.q || params.query,
                searchHub: suggestions.analytics.searchHub,
                pipeline: suggestions.analytics.pipeline
            })
        });
    } catch (error) {
        Logger.error('Coveo product suggest failed.', {
            message: error.message
        });

        res.setStatusCode(502);
        res.json({
            error: true,
            message: 'Unable to retrieve Coveo product suggestions.'
        });
    }

    return next();
});

server.get('Recommendations', function (req, res, next) {
    var params = buildParams(req);
    var recommendations;

    try {
        recommendations = CommerceApiService.recommendations(params);
        res.json({
            recommendations: recommendations.recommendations,
            responseId: recommendations.responseId,
            analytics: recommendations.analytics,
            dataLayer: GtmHelper.buildRecommendationResponseEvent(recommendations, {
                slotId: params.slotId,
                productId: params.productId || params.pid,
                searchHub: recommendations.analytics.searchHub,
                pipeline: recommendations.analytics.pipeline
            })
        });
    } catch (error) {
        Logger.error('Coveo recommendations failed.', {
            message: error.message
        });

        res.setStatusCode(502);
        res.json({
            error: true,
            message: 'Unable to retrieve Coveo recommendations.'
        });
    }

    return next();
});

module.exports = server.exports();
