'use strict';

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function normalizeArray(value) {
    if (!value) {
        return [];
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
        return value;
    }

    if (typeof value === 'string') {
        if (value.charAt(0) === '[') {
            return parseJson(value, []);
        }

        return value.split(',').map(function (entry) {
            return entry.replace(/^\s+|\s+$/g, '');
        }).filter(function (entry) {
            return entry;
        });
    }

    return [value];
}

function normalizeObject(value) {
    if (!value) {
        return {};
    }

    if (typeof value === 'object') {
        return value;
    }

    return parseJson(value, {});
}

function parseLocale(value) {
    var source = String(value || '').replace('_', '-').split('-');
    var language = source[0] && /^[A-Za-z]{2,3}$/.test(source[0]) ? String(source[0]).toLowerCase() : '';
    var country = source[1] && /^[A-Za-z]{2}$/.test(source[1]) ? String(source[1]).toUpperCase() : '';

    return {
        language: language,
        country: country
    };
}

function getHttpRequest(params) {
    if (params && params.request) {
        return params.request;
    }

    if (typeof request !== 'undefined') {
        return request;
    }

    return null;
}

function getRequestLocaleId(httpRequest) {
    if (!httpRequest) {
        return '';
    }

    if (httpRequest.locale) {
        if (typeof httpRequest.locale === 'string') {
            return String(httpRequest.locale);
        }

        if (httpRequest.locale.id) {
            return String(httpRequest.locale.id);
        }
    }

    if (httpRequest.getLocale) {
        return String(httpRequest.getLocale());
    }

    return '';
}

function getRequestCurrency(httpRequest) {
    var currentSession = httpRequest && httpRequest.session ? httpRequest.session : null;

    if (currentSession && currentSession.currency && currentSession.currency.currencyCode) {
        return String(currentSession.currency.currencyCode);
    }

    return '';
}

function buildCurrentUrl(httpRequest) {
    var httpUrl = httpRequest && httpRequest.httpURL && httpRequest.httpURL.toString ? httpRequest.httpURL.toString() : '';
    var queryString = httpRequest && httpRequest.httpQueryString ? String(httpRequest.httpQueryString) : '';

    if (httpUrl && queryString) {
        if (httpUrl.indexOf('?') !== -1) {
            return httpUrl;
        }

        return httpUrl + '?' + queryString;
    }

    return httpUrl;
}

function buildBaseContext(params) {
    var requestContext = normalizeObject(params.context);
    var httpRequest = getHttpRequest(params);
    var userAgent = httpRequest && httpRequest.httpUserAgent ? String(httpRequest.httpUserAgent) : '';
    var referrer = httpRequest && httpRequest.httpReferer ? String(httpRequest.httpReferer) : '';
    var locationUrl = params.currentUrl || buildCurrentUrl(httpRequest);

    requestContext.view = requestContext.view || {};
    requestContext.view.url = requestContext.view.url || locationUrl;
    requestContext.capture = typeof requestContext.capture === 'boolean' ? requestContext.capture : true;
    requestContext.cart = requestContext.cart || [];

    if (userAgent || referrer) {
        requestContext.user = requestContext.user || {};
        requestContext.user.userAgent = requestContext.user.userAgent || userAgent;
        requestContext.user.referrer = requestContext.user.referrer || referrer;
    }

    return requestContext;
}

function buildCommerceContext(params, config) {
    var httpRequest = getHttpRequest(params);
    var parsedRequestLocale = parseLocale((params && params.locale) || getRequestLocaleId(httpRequest));

    return {
        language: params.language || parsedRequestLocale.language || config.language,
        country: params.country || parsedRequestLocale.country || config.country,
        currency: params.currency || getRequestCurrency(httpRequest) || config.currency
    };
}

function decodeSort(value) {
    var parsed = parseJson(value, null);

    if (parsed && typeof parsed === 'object') {
        return parsed;
    }

    if (!value) {
        return {
            sortCriteria: 'relevance'
        };
    }

    if (typeof value === 'object') {
        return value;
    }

    if (value === 'relevance') {
        return {
            sortCriteria: 'relevance'
        };
    }

    return null;
}

function buildFacetValue(value) {
    var source = String(value || '');
    var parts;

    if (source.indexOf('range:') === 0) {
        parts = source.split(':');

        return {
            state: 'selected',
            start: parseFloat(parts[1]),
            end: parseFloat(parts[2]),
            endInclusive: parts[3] !== '0'
        };
    }

    return {
        state: 'selected',
        value: source
    };
}

function buildFacets(filters) {
    var source = normalizeObject(filters);

    return Object.keys(source).map(function (facetId) {
        var values = source[facetId];

        return {
            facetId: facetId,
            field: facetId,
            type: (values || []).some(function (entry) {
                return String(entry || '').indexOf('range:') === 0;
            }) ? 'numericalRange' : 'regular',
            values: normalizeArray(values).map(buildFacetValue)
        };
    }).filter(function (facet) {
        return facet.values.length > 0;
    });
}

function buildSearchPayload(params, config, analyticsContext) {
    var commerceContext = buildCommerceContext(params, config);
    var payload = {
        trackingId: params.trackingId || config.trackingId,
        clientId: analyticsContext.clientId,
        language: commerceContext.language,
        country: commerceContext.country,
        currency: commerceContext.currency,
        query: params.q || params.query || '',
        page: normalizeNumber(params.page, 0),
        perPage: normalizeNumber(params.perPage || params.sz, 12),
        sort: decodeSort(params.sort),
        context: buildBaseContext(params)
    };

    payload.facets = buildFacets(params.filters || params.refinements || params.facets);

    if (!payload.facets.length) {
        delete payload.facets;
    }

    return payload;
}

function buildListingPayload(params, config, analyticsContext) {
    var commerceContext = buildCommerceContext(params, config);
    var payload = {
        trackingId: params.trackingId || config.trackingId,
        clientId: analyticsContext.clientId,
        language: commerceContext.language,
        country: commerceContext.country,
        currency: commerceContext.currency,
        page: normalizeNumber(params.page, 0),
        perPage: normalizeNumber(params.perPage || params.sz, 12),
        sort: decodeSort(params.sort),
        context: buildBaseContext(params)
    };

    payload.facets = buildFacets(params.filters || params.refinements || params.facets);

    if (!payload.facets.length) {
        delete payload.facets;
    }

    return payload;
}

function buildQuerySuggestPayload(params, config, analyticsContext) {
    var commerceContext = buildCommerceContext(params, config);
    return {
        trackingId: params.trackingId || config.trackingId,
        clientId: analyticsContext.clientId,
        language: commerceContext.language,
        country: commerceContext.country,
        currency: commerceContext.currency,
        query: params.q || params.query || '',
        count: normalizeNumber(params.count, 5),
        context: buildBaseContext(params)
    };
}

function buildProductSuggestPayload(params, config, analyticsContext) {
    var commerceContext = buildCommerceContext(params, config);

    return {
        trackingId: params.trackingId || config.trackingId,
        clientId: analyticsContext.clientId,
        language: commerceContext.language,
        country: commerceContext.country,
        currency: commerceContext.currency,
        query: params.q || params.query || '',
        context: buildBaseContext(params)
    };
}

function buildRecommendationsPayload(params, config, analyticsContext) {
    var commerceContext = buildCommerceContext(params, config);
    return {
        slotId: params.slotId || '',
        productId: params.productId || params.pid || '',
        trackingId: params.trackingId || config.trackingId,
        clientId: analyticsContext.clientId,
        language: commerceContext.language,
        country: commerceContext.country,
        currency: commerceContext.currency,
        context: buildBaseContext(params)
    };
}

module.exports = {
    buildSearchPayload: buildSearchPayload,
    buildListingPayload: buildListingPayload,
    buildQuerySuggestPayload: buildQuerySuggestPayload,
    buildProductSuggestPayload: buildProductSuggestPayload,
    buildRecommendationsPayload: buildRecommendationsPayload
};
