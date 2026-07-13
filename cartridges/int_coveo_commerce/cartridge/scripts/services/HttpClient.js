'use strict';

var AuthenticationService = require('*/cartridge/scripts/services/AuthenticationService');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');
var LocalServiceClient = require('*/cartridge/scripts/services/LocalServiceClient');

function normalizeBoolean(value) {
    return value === true || value === 'true' || value === '1';
}

function parseBody(rawBody, parseJson) {
    if (!parseJson || !rawBody) {
        return rawBody;
    }

    return JSON.parse(rawBody);
}

function parseJsonSafely(rawValue, fallback) {
    if (!rawValue) {
        return fallback;
    }

    if (typeof rawValue === 'object') {
        return rawValue;
    }

    try {
        return JSON.parse(rawValue);
    } catch (error) {
        return fallback;
    }
}

function getHttpResponse(authContext) {
    if (authContext && authContext.response) {
        return authContext.response;
    }

    if (typeof response !== 'undefined') {
        return response;
    }

    return null;
}

function setResponseHeader() {
    return;
}

function sanitizeHeaderValue(value, maxLength) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^\s+|\s+$/g, '')
        .slice(0, maxLength || 512);
}

function summarizeFacetValue(value) {
    if (!value) {
        return '';
    }

    if (typeof value.value !== 'undefined') {
        return value.value;
    }

    return {
        start: value.start,
        end: value.end,
        endInclusive: value.endInclusive === true
    };
}

function summarizeFacets(facets) {
    var source = facets || [];

    return source.map(function (facet) {
        return {
            facetId: facet.facetId || facet.field || '',
            type: facet.type || '',
            values: (facet.values || []).map(summarizeFacetValue)
        };
    });
}

function stringifyFacetValues(values) {
    return (values || []).map(function (value) {
        if (typeof value === 'string') {
            return value;
        }

        if (typeof value.value !== 'undefined') {
            return String(value.value);
        }

        if (typeof value.start !== 'undefined' || typeof value.end !== 'undefined') {
            return [value.start, value.end].join('-');
        }

        return '';
    }).filter(function (value) {
        return value;
    }).join('|');
}

function summarizeContext(context) {
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

function buildRequestDebugSummary(operationName, method, url, payload) {
    var source = parseJsonSafely(payload, {});
    var facets = summarizeFacets(source.facets);
    var summary = {
        operation: operationName,
        method: method,
        url: url,
        trackingId: source.trackingId || '',
        clientId: source.clientId || '',
        language: source.language || '',
        country: source.country || '',
        currency: source.currency || '',
        query: source.query || '',
        page: typeof source.page === 'number' ? source.page : null,
        perPage: typeof source.perPage === 'number' ? source.perPage : null,
        count: typeof source.count === 'number' ? source.count : null,
        productId: source.productId || '',
        slotId: source.slotId || '',
        sort: source.sort || null,
        facets: facets,
        context: summarizeContext(source.context)
    };

    if (!facets.length) {
        delete summary.facets;
    }

    if (!summary.query) {
        delete summary.query;
    }

    if (!summary.productId) {
        delete summary.productId;
    }

    if (!summary.slotId) {
        delete summary.slotId;
    }

    if (summary.count === null) {
        delete summary.count;
    }

    return summary;
}

function buildResponseDebugSummary(operationName, response, attempt) {
    var source = response && response.data ? response.data : parseJsonSafely(response && response.body, {});
    var products = [];
    var suggestions = [];
    var facets = [];
    var pagination = source && source.pagination ? source.pagination : source;
    var summary = {
        operation: operationName,
        statusCode: response.statusCode,
        duration: response.duration,
        attempt: attempt
    };

    if (source && source.products) {
        products = source.products;
    } else if (source && source.results) {
        products = source.results;
    }

    if (source && source.suggestions) {
        suggestions = source.suggestions;
    } else if (source && source.items) {
        suggestions = source.items;
    }

    if (source && source.facets) {
        facets = source.facets;
    } else if (source && source.filters) {
        facets = source.filters;
    }

    if (source && source.responseId) {
        summary.responseId = source.responseId;
    }

    if (source && source.queryUid) {
        summary.queryUid = source.queryUid;
    }

    if (pagination && typeof pagination.total !== 'undefined') {
        summary.total = pagination.total;
    } else if (pagination && typeof pagination.totalCount !== 'undefined') {
        summary.total = pagination.totalCount;
    }

    if (products && typeof products.length === 'number') {
        summary.productCount = products.length;
    }

    if (suggestions && typeof suggestions.length === 'number' && suggestions.length) {
        summary.suggestionCount = suggestions.length;
    }

    if (facets && typeof facets.length === 'number') {
        summary.facetCount = facets.length;
    }

    return summary;
}

function buildFailureDebugSummary(operationName, error, attempt) {
    var response = error && error.response ? error.response : null;
    var summary = {
        operation: operationName,
        attempt: attempt,
        message: error && error.message ? error.message : 'Unknown error'
    };

    if (response) {
        summary.statusCode = response.statusCode;
        summary.duration = response.duration;

        if (response.data && response.data.responseId) {
            summary.responseId = response.data.responseId;
        }
    }

    return summary;
}

function buildRequestDebugHeader(summary) {
    var parts = [
        'operation=' + summary.operation
    ];
    var facets = (summary.facets || []).map(function (facet) {
        return facet.facetId + '=' + stringifyFacetValues(facet.values);
    }).filter(function (facet) {
        return facet;
    }).join(',');

    if (summary.query) {
        parts.push('query=' + summary.query);
    }

    if (facets) {
        parts.push('facets=' + facets);
    }

    if (summary.page !== null) {
        parts.push('page=' + summary.page);
    }

    if (summary.perPage !== null) {
        parts.push('perPage=' + summary.perPage);
    }

    return sanitizeHeaderValue(parts.join(';'));
}

function buildResponseDebugHeader(summary) {
    var parts = [
        'operation=' + summary.operation,
        'status=' + summary.statusCode
    ];

    if (typeof summary.total !== 'undefined') {
        parts.push('total=' + summary.total);
    }

    if (typeof summary.productCount !== 'undefined') {
        parts.push('products=' + summary.productCount);
    }

    if (typeof summary.facetCount !== 'undefined') {
        parts.push('facets=' + summary.facetCount);
    }

    if (summary.responseId) {
        parts.push('responseId=' + summary.responseId);
    }

    return sanitizeHeaderValue(parts.join(';'));
}

function buildFailureDebugHeader(summary) {
    var parts = [
        'operation=' + summary.operation,
        'attempt=' + summary.attempt,
        'message=' + summary.message
    ];

    if (summary.statusCode) {
        parts.push('status=' + summary.statusCode);
    }

    return sanitizeHeaderValue(parts.join(';'));
}

function isCoveoDebugEnabled(authContext) {
    return !!(authContext && normalizeBoolean(authContext.coveoDebug));
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

function request(options) {
    var settings = Config.getSettings();
    var requestOptions = options || {};
    var method = (requestOptions.method || 'GET').toUpperCase();
    var operationName = requestOptions.name || requestOptions.url || 'request';
    var headers = AuthenticationService.buildHeaders(requestOptions.headers || {}, settings, requestOptions.authContext);
    var payload = requestOptions.body;
    var timeoutMillis = requestOptions.timeout || settings.timeoutMillis;
    var retryCount = typeof requestOptions.retryCount === 'number' ? requestOptions.retryCount : settings.retryCount;
    var maxAttempts = Math.max(1, retryCount + 1);
    var debugEnabled = isCoveoDebugEnabled(requestOptions.authContext);
    var httpResponse = getHttpResponse(requestOptions.authContext);
    var response;
    var attempt;
    var error;
    var requestDebugSummary;
    var responseDebugSummary;
    var failureDebugSummary;

    if (debugEnabled) {
        requestDebugSummary = buildRequestDebugSummary(
            operationName,
            method,
            requestOptions.url,
            requestOptions.body
        );

        setResponseHeader(
            httpResponse,
            'X-Coveo-Commerce-Debug-Request',
            buildRequestDebugHeader(requestDebugSummary)
        );
        Logger.warn('Coveo Commerce debug request.', requestDebugSummary);
    }

    for (attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            response = LocalServiceClient.call(Config.SERVICE_IDS.COMMERCE_API, {
                name: operationName,
                method: method,
                url: requestOptions.url,
                headers: headers,
                body: payload,
                timeout: timeoutMillis
            });
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

            if (debugEnabled) {
                responseDebugSummary = buildResponseDebugSummary(
                    operationName,
                    response,
                    attempt
                );

                setResponseHeader(
                    httpResponse,
                    'X-Coveo-Commerce-Debug-Response',
                    buildResponseDebugHeader(responseDebugSummary)
                );
                Logger.warn('Coveo Commerce debug response.', responseDebugSummary);
            }

            return response;
        } catch (requestError) {
            error = requestError;

            Logger.warn('Coveo Commerce API request failed.', {
                operation: operationName,
                attempt: attempt,
                message: requestError.message,
                statusCode: requestError.statusCode || null
            });

            if (debugEnabled) {
                failureDebugSummary = buildFailureDebugSummary(
                    operationName,
                    requestError,
                    attempt
                );

                setResponseHeader(
                    httpResponse,
                    'X-Coveo-Commerce-Debug-Failure',
                    buildFailureDebugHeader(failureDebugSummary)
                );
                Logger.warn('Coveo Commerce debug failure.', failureDebugSummary);
            }

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
