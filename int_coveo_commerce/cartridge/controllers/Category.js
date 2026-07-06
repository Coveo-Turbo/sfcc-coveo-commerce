'use strict';

var server = require('server');
var CommerceApiService = require('*/cartridge/scripts/services/CommerceApiService');
var ListingResult = require('*/cartridge/models/ListingResult');
var GtmHelper = require('*/cartridge/scripts/helpers/GtmHelper');
var Logger = require('*/cartridge/scripts/helpers/Logger');

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

function buildParams(req) {
    var query = req.querystring || {};
    var params = {};

    Object.keys(query).forEach(function (key) {
        params[key] = query[key];
    });

    params.categoryId = params.categoryId || params.cgid || '';
    params.request = getHttpRequest();
    params.response = getHttpResponse();

    return params;
}

function setStatus(res, statusCode) {
    if (res.setStatusCode) {
        res.setStatusCode(statusCode);
        return;
    }

    if (getHttpResponse() && getHttpResponse().setStatus) {
        getHttpResponse().setStatus(statusCode);
    }
}

function renderPageError(res, error) {
    Logger.error('Coveo category controller failed.', {
        message: error.message,
        stack: error.stack
    });

    setStatus(res, 502);
    res.setViewData({
        coveoListing: new ListingResult(),
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
        result = CommerceApiService.listing(params);

        res.setViewData({
            coveoListing: result,
            coveoAnalytics: result.analytics,
            coveoDataLayer: GtmHelper.buildListingResponseEvent(result, {
                categoryId: params.categoryId,
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

module.exports = server.exports();
