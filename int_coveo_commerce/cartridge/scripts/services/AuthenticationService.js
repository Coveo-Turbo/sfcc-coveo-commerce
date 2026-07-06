'use strict';

var Config = require('*/cartridge/scripts/config/Config');

var AUTH_STRATEGIES = {
    BEARER: 'bearer',
    OAUTH: 'oauth'
};

function getAccessToken(settings) {
    var config = settings || Config.getSettings();

    if (config.authStrategy === AUTH_STRATEGIES.OAUTH) {
        throw new Error('OAuth authentication is not implemented for int_coveo_commerce.');
    }

    if (!config.apiToken) {
        throw new Error('Missing Coveo Commerce API bearer token.');
    }

    return config.apiToken;
}

function buildHeaders(baseHeaders, settings) {
    var config = settings || Config.getSettings();
    var headers = {};
    var source = baseHeaders || {};

    Object.keys(source).forEach(function (key) {
        headers[key] = source[key];
    });

    headers.Authorization = 'Bearer ' + getAccessToken(config);

    return headers;
}

module.exports = {
    AUTH_STRATEGIES: AUTH_STRATEGIES,
    getAccessToken: getAccessToken,
    buildHeaders: buildHeaders
};
