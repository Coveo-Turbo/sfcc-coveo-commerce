'use strict';

var server = require('server');
var SearchBoxHelper = require('*/cartridge/scripts/helpers/coveoSearchBoxHelpers');
var Logger = require('int_coveo_commerce/cartridge/scripts/helpers/Logger');

function getHttpResponse() {
    if (typeof response !== 'undefined') {
        return response;
    }

    return null;
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

function renderError(res, logMessage, publicMessage, error) {
    Logger.error(logMessage, {
        message: error.message,
        stack: error.stack
    });

    setStatus(res, 502);
    res.json({
        error: true,
        message: publicMessage
    });
}

server.get('Bootstrap', function (req, res, next) {
    try {
        res.json(SearchBoxHelper.buildBootstrapResponse(req));
    } catch (error) {
        renderError(res, 'Mondou Coveo search box bootstrap failed.', 'Unable to load the Coveo search box bootstrap.', error);
    }

    return next();
});

server.get('Suggest', function (req, res, next) {
    try {
        res.json(SearchBoxHelper.buildSuggestResponse(req));
    } catch (error) {
        renderError(res, 'Mondou Coveo search box query suggestions failed.', 'Unable to load Coveo search suggestions.', error);
    }

    return next();
});

server.get('Preview', function (req, res, next) {
    try {
        res.json(SearchBoxHelper.buildPreviewResponse(req));
    } catch (error) {
        renderError(res, 'Mondou Coveo search box product preview failed.', 'Unable to load Coveo product suggestions.', error);
    }

    return next();
});

module.exports = server.exports();
