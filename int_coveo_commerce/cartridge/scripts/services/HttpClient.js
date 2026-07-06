'use strict';

var SFCCHttpClient = require('dw/net/HTTPClient');
var AuthenticationService = require('*/cartridge/scripts/services/AuthenticationService');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');

function getNow() {
    return new Date().getTime();
}

function getStatusCode(httpClient) {
    if (httpClient.getStatusCode) {
        return httpClient.getStatusCode();
    }

    return httpClient.statusCode;
}

function getText(httpClient) {
    if (httpClient.getText) {
        return httpClient.getText();
    }

    return httpClient.text;
}

function getHeaders(httpClient) {
    if (!httpClient.getAllResponseHeaders) {
        return {};
    }

    return httpClient.getAllResponseHeaders();
}

function parseBody(rawBody, parseJson) {
    if (!parseJson || !rawBody) {
        return rawBody;
    }

    return JSON.parse(rawBody);
}

function createResponseError(response, operationName) {
    var error = new Error('Coveo Commerce API request failed for ' + operationName + ' with status ' + response.statusCode + '.');

    error.name = 'CoveoCommerceHttpError';
    error.statusCode = response.statusCode;
    error.response = response;
    error.retryable = response.statusCode === 429 || response.statusCode >= 500;

    return error;
}

function isRetryable(error) {
    if (!error) {
        return false;
    }

    return error.retryable === true;
}

function send(method, url, headers, body, timeoutMillis) {
    var httpClient = new SFCCHttpClient();
    var start = getNow();
    var statusCode;
    var rawBody;
    var response;

    httpClient.open(method, url);
    httpClient.setTimeout(timeoutMillis);

    Object.keys(headers).forEach(function (headerName) {
        httpClient.setRequestHeader(headerName, headers[headerName]);
    });

    if (body) {
        httpClient.send(body);
    } else {
        httpClient.send();
    }

    statusCode = getStatusCode(httpClient);
    rawBody = getText(httpClient);
    response = {
        statusCode: statusCode,
        ok: statusCode >= 200 && statusCode < 300,
        body: rawBody,
        headers: getHeaders(httpClient),
        duration: getNow() - start
    };

    return response;
}

function request(options) {
    var settings = Config.getSettings();
    var requestOptions = options || {};
    var method = (requestOptions.method || 'GET').toUpperCase();
    var operationName = requestOptions.name || requestOptions.url || 'request';
    var headers = AuthenticationService.buildHeaders(requestOptions.headers || {}, settings);
    var payload = requestOptions.body;
    var timeoutMillis = requestOptions.timeout || settings.timeoutMillis;
    var retryCount = typeof requestOptions.retryCount === 'number' ? requestOptions.retryCount : settings.retryCount;
    var maxAttempts = Math.max(1, retryCount + 1);
    var response;
    var attempt;
    var error;

    if (payload && typeof payload !== 'string') {
        payload = JSON.stringify(payload);
    }

    for (attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            response = send(method, requestOptions.url, headers, payload, timeoutMillis);
            response.data = parseBody(response.body, requestOptions.parseJson !== false);

            if (!response.ok) {
                throw createResponseError(response, operationName);
            }

            Logger.info('Coveo Commerce API request completed.', {
                operation: operationName,
                statusCode: response.statusCode,
                duration: response.duration,
                attempt: attempt
            });

            return response;
        } catch (requestError) {
            error = requestError;

            Logger.warn('Coveo Commerce API request failed.', {
                operation: operationName,
                attempt: attempt,
                message: requestError.message,
                statusCode: requestError.statusCode || null
            });

            if (attempt >= maxAttempts || !isRetryable(requestError)) {
                break;
            }
        }
    }

    Logger.error('Coveo Commerce API request exhausted retries.', {
        operation: operationName,
        message: error && error.message ? error.message : 'Unknown error'
    });

    throw error;
}

module.exports = {
    request: request
};
