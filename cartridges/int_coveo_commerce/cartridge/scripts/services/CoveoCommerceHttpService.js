'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');
var SearchTokenService = require('*/cartridge/scripts/services/SearchTokenService');
var ServiceSupport = require('*/cartridge/scripts/services/CoveoServiceSupport');
var UrlHelper = require('*/cartridge/scripts/helpers/UrlHelper');

var AUTH_MODES = Config.AUTH_MODES;

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

function buildRequestDebugSummary(operationName, endpointPath, payload) {
    var source = parseJsonSafely(payload, {});
    var facets = summarizeFacets(source.facets);
    var summary = {
        operation: operationName,
        endpoint: endpointPath,
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
    } else if (source && source.completions) {
        suggestions = source.completions;
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
    } else if (pagination && typeof pagination.totalEntries !== 'undefined') {
        summary.total = pagination.totalEntries;
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

function getCommerceApiBaseUrl(service, settings) {
    var config = settings || {};
    var configuredUrl = ServiceSupport.getCredentialURL(service) || config.apiEndpoint;

    if (!configuredUrl) {
        throw new Error('Missing Coveo Commerce service credential URL.');
    }

    if (configuredUrl.indexOf('/commerce/') !== -1) {
        return configuredUrl;
    }

    return UrlHelper.buildEndpoint(
        configuredUrl,
        'rest/organizations/' + config.organizationId + '/commerce/v2'
    );
}

function getAccessToken(service, settings, authContext) {
    var config = settings || {};

    if (config.authMode === AUTH_MODES.SEARCH_TOKEN) {
        return SearchTokenService.requestSearchToken(authContext || {}, config);
    }

    return ServiceSupport.getCredentialPassword(service) || config.apiToken || '';
}

function buildMockPayload(endpointPath) {
    switch (endpointPath) {
    case 'search/querySuggest':
        return {
            completions: [],
            responseId: 'mock-response-id',
            queryUid: 'mock-query-uid'
        };
    case 'search/productSuggest':
        return {
            items: [],
            responseId: 'mock-response-id',
            queryUid: 'mock-query-uid'
        };
    case 'recommendations':
        return {
            recommendations: [],
            responseId: 'mock-response-id'
        };
    case 'listing':
        return {
            products: [],
            facets: [],
            pagination: {
                page: 1,
                perPage: 0,
                totalEntries: 0,
                totalPages: 0
            },
            responseId: 'mock-response-id'
        };
    default:
        return {
            products: [],
            facets: [],
            pagination: {
                page: 1,
                perPage: 0,
                totalEntries: 0,
                totalPages: 0
            },
            responseId: 'mock-response-id',
            queryUid: 'mock-query-uid'
        };
    }
}

function createService() {
    return LocalServiceRegistry.createService(Config.SERVICE_IDS.COMMERCE_API, {
        createRequest: function (service, requestData) {
            var data = requestData || {};
            var settings = data.settings || {};
            var accessToken = getAccessToken(service, settings, data.authContext);

            if (!accessToken) {
                throw new Error('Missing Coveo Commerce API bearer token on the commerce service credential.');
            }

            service.setAuthentication('NONE');
            service.setRequestMethod('POST');
            service.setURL(
                UrlHelper.buildEndpoint(
                    getCommerceApiBaseUrl(service, settings),
                    data.endpointPath || ''
                )
            );
            service.setEncoding('UTF-8');
            service.addHeader('Accept', 'application/json');
            service.addHeader('Content-Type', 'application/json');
            service.addHeader('Authorization', 'Bearer ' + accessToken);

            return ServiceSupport.normalizeBody(data.payload);
        },
        parseResponse: function (service, httpClient) {
            return ServiceSupport.buildResponseFromClient(httpClient, 0);
        },
        getRequestLogMessage: function (requestData) {
            var data = requestData || {};

            return ServiceSupport.sanitizeLogValue('POST ' + (data.endpointPath || ''), 512);
        },
        getResponseLogMessage: function (responseData) {
            return ServiceSupport.buildStatusLogMessage(responseData);
        },
        filterLogMessage: function (message) {
            return ServiceSupport.filterLogMessage(message);
        },
        mockCall: function (service, requestData) {
            var data = requestData || {};

            return {
                statusCode: 200,
                statusMessage: 'Success',
                text: JSON.stringify(buildMockPayload(data.endpointPath || ''))
            };
        }
    });
}

function call(requestOptions) {
    var options = requestOptions || {};
    var service = createService();
    var startedAt = ServiceSupport.getNow();
    var result = service.call({
        endpointPath: options.endpointPath,
        payload: options.body,
        authContext: options.authContext,
        settings: options.settings
    });

    return ServiceSupport.createServiceResult(
        Config.SERVICE_IDS.COMMERCE_API,
        options.name || options.endpointPath || 'request',
        result,
        service,
        startedAt
    );
}

function request(options) {
    var settings = (options && options.settings) || Config.getSettings();
    var requestOptions = options || {};
    var operationName = requestOptions.name || requestOptions.endpointPath || 'request';
    var retryCount = typeof requestOptions.retryCount === 'number' ? requestOptions.retryCount : settings.retryCount;
    var maxAttempts = Math.max(1, retryCount + 1);
    var debugEnabled = isCoveoDebugEnabled(requestOptions.authContext);
    var response;
    var attempt;
    var error;
    var requestDebugSummary;
    var responseDebugSummary;
    var failureDebugSummary;

    if (debugEnabled) {
        requestDebugSummary = buildRequestDebugSummary(
            operationName,
            requestOptions.endpointPath,
            requestOptions.body
        );
        Logger.warn('Coveo Commerce debug request.', requestDebugSummary);
    }

    for (attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            response = call({
                name: operationName,
                endpointPath: requestOptions.endpointPath,
                body: requestOptions.body,
                authContext: requestOptions.authContext,
                settings: settings
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
