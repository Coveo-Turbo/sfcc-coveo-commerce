'use strict';

var Config = require('*/cartridge/scripts/config/Config');
var SearchTokenService = require('*/cartridge/scripts/services/SearchTokenService');

var AUTH_MODES = Config.AUTH_MODES;

function getAccessToken(settings, authContext) {
    var config = settings || Config.getSettings();

    if (config.authMode === AUTH_MODES.SEARCH_TOKEN) {
        return SearchTokenService.requestSearchToken(authContext || {}, config);
    }

    if (!config.apiToken) {
        throw new Error('Missing Coveo Commerce API bearer token.');
    }

    return config.apiToken;
}

function buildHeaders(baseHeaders, settings, authContext) {
    var config = settings || Config.getSettings();
    var headers = {};
    var source = baseHeaders || {};

    Object.keys(source).forEach(function (key) {
        headers[key] = source[key];
    });

    headers.Authorization = 'Bearer ' + getAccessToken(config, authContext);

    return headers;
}

module.exports = {
    AUTH_MODES: AUTH_MODES,
    getAccessToken: getAccessToken,
    buildHeaders: buildHeaders
};
