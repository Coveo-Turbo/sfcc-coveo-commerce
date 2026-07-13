'use strict';
/* global request, response */

var server = require('server');
var CommerceApiService = require('*/cartridge/scripts/services/CommerceApiService');
var ListingResult = require('*/cartridge/models/ListingResult');
var GtmHelper = require('*/cartridge/scripts/helpers/GtmHelper');
var Logger = require('*/cartridge/scripts/helpers/Logger');

function buildParams(req) {
    var query = req.querystring || {};
    var params = {};

    Object.keys(query).forEach(function (key) {
        params[key] = query[key];
    });

    params.categoryId = params.categoryId || params.cgid || '';
    params.currentCustomer = req.currentCustomer;
    params.session = req.session;
    params.request = request;
    params.response = response;

    return params;
}

function renderPageError(res, error) {
    Logger.error('Coveo category controller failed.', {
        message: error.message,
        stack: error.stack
    });

    res.setStatusCode(502);
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
