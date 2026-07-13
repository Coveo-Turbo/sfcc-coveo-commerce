'use strict';
/* eslint-disable no-console */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var repoRoot = path.resolve(__dirname, '..');
var tests = [];

function test(name, fn) {
    tests.push({
        name: name,
        fn: fn
    });
}

function resolveLocalModule(baseDir, request) {
    var candidate = path.resolve(baseDir, request);

    if (path.extname(candidate)) {
        return candidate;
    }

    return candidate + '.js';
}

function loadModule(filePath, stubs, cache) {
    var absolutePath = path.resolve(filePath);
    var moduleCache = cache || {};
    var source;
    var module;
    var dirname;

    if (moduleCache[absolutePath]) {
        return moduleCache[absolutePath].exports;
    }

    source = fs.readFileSync(absolutePath, 'utf8');
    module = {
        exports: {}
    };
    dirname = path.dirname(absolutePath);
    moduleCache[absolutePath] = module;

    function localRequire(request) {
        if (stubs && Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }

        if (request.indexOf('./') === 0 || request.indexOf('../') === 0) {
            return loadModule(resolveLocalModule(dirname, request), stubs, moduleCache);
        }

        return require(request);
    }

    vm.runInNewContext(
        '(function (exports, require, module, __filename, __dirname) {' + source + '\n})',
        {
            console: console,
            process: process,
            setTimeout: setTimeout,
            clearTimeout: clearTimeout
        }
    )(module.exports, localRequire, module, absolutePath, dirname);

    return module.exports;
}

test('QueryBuilder builds productSuggest payload from request context', function () {
    var QueryBuilder = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/QueryBuilder.js'));
    var payload = QueryBuilder.buildProductSuggestPayload({
        query: 'chien',
        request: {
            locale: {
                id: 'fr_CA'
            },
            session: {
                currency: {
                    currencyCode: 'CAD'
                }
            },
            httpURL: {
                toString: function () {
                    return 'https://example.com/s/site/fr-CA/search';
                }
            },
            httpQueryString: 'q=chien',
            httpUserAgent: 'Mozilla/5.0',
            httpReferer: 'https://example.com/'
        }
    }, {
        trackingId: 'storefront',
        language: 'en',
        country: 'US',
        currency: 'USD'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(payload.trackingId, 'storefront');
    assert.strictEqual(payload.clientId, 'client-1');
    assert.strictEqual(payload.language, 'fr');
    assert.strictEqual(payload.country, 'CA');
    assert.strictEqual(payload.currency, 'CAD');
    assert.strictEqual(payload.query, 'chien');
    assert.strictEqual(payload.context.view.url, 'https://example.com/s/site/fr-CA/search?q=chien');
});

test('QueryBuilder builds listing payload with categoryId from request context', function () {
    var QueryBuilder = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/QueryBuilder.js'));
    var payload = QueryBuilder.buildListingPayload({
        cgid: 'dogs',
        request: {
            locale: {
                id: 'fr_CA'
            },
            session: {
                currency: {
                    currencyCode: 'CAD'
                }
            }
        }
    }, {
        trackingId: 'storefront',
        language: 'en',
        country: 'US',
        currency: 'USD'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(payload.categoryId, 'dogs');
    assert.strictEqual(payload.language, 'fr');
    assert.strictEqual(payload.country, 'CA');
    assert.strictEqual(payload.currency, 'CAD');
});

test('ProductSuggestionMapper normalizes products and analytics metadata', function () {
    var ProductMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/ProductMapper.js'));
    var ProductSuggestionMapper = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/ProductSuggestionMapper.js'),
        {
            '*/cartridge/scripts/mappers/ProductMapper': ProductMapper
        }
    );
    var mapped = ProductSuggestionMapper.map({
        items: [{
            productId: 'sku-1',
            name: 'Croquettes',
            url: '/p/croquettes',
            image: 'https://images.example.com/croquettes.jpg',
            price: 19.99,
            ec_brand: 'Acme'
        }],
        responseId: 'response-1',
        queryUid: 'query-1'
    }, {}, {
        clientId: 'client-1',
        searchHub: 'storefront',
        pipeline: 'commerce-search'
    });

    assert.strictEqual(mapped.products.length, 1);
    assert.strictEqual(mapped.products[0].id, 'sku-1');
    assert.strictEqual(mapped.products[0].brand, 'Acme');
    assert.strictEqual(mapped.responseId, 'response-1');
    assert.strictEqual(mapped.analytics.clientId, 'client-1');
    assert.strictEqual(mapped.analytics.queryUid, 'query-1');
});

test('PaginationMapper supports nested listing pagination payloads', function () {
    var PaginationMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/PaginationMapper.js'));
    var mapped = PaginationMapper.map({
        pagination: {
            page: 1,
            perPage: 24,
            totalEntries: 17,
            totalPages: 1
        }
    }, {});

    assert.strictEqual(mapped.page, 1);
    assert.strictEqual(mapped.perPage, 24);
    assert.strictEqual(mapped.total, 17);
    assert.strictEqual(mapped.totalPages, 1);
});

test('SortMapper supports nested listing sort payloads', function () {
    var SortMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/SortMapper.js'));
    var mapped = SortMapper.map({
        sort: {
            appliedSort: {
                sortCriteria: 'relevance'
            },
            availableSorts: [{
                sortCriteria: 'relevance'
            }, {
                sortCriteria: 'fields',
                fields: [{
                    field: 'ec_price',
                    direction: 'asc',
                    displayName: 'Prix croissant'
                }]
            }]
        }
    }, {});

    assert.strictEqual(mapped.selected, 'relevance');
    assert.strictEqual(mapped.options.length, 2);
    assert.strictEqual(mapped.options[0].label, 'Relevance');
    assert.strictEqual(mapped.options[1].label, 'Prix croissant');
    assert.strictEqual(mapped.options[1].id, 'fields:ec_price:asc');
});

test('AuthenticationService uses direct API token in apiKey mode', function () {
    var AuthenticationService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/AuthenticationService.js'),
        {
            '*/cartridge/scripts/config/Config': {
                AUTH_MODES: {
                    API_KEY: 'apiKey',
                    SEARCH_TOKEN: 'searchToken'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/SearchTokenService': {
                requestSearchToken: function () {
                    throw new Error('Search token flow should not be used in apiKey mode.');
                }
            }
        }
    );
    var headers = AuthenticationService.buildHeaders({
        Accept: 'application/json'
    }, {
        authMode: 'apiKey',
        apiToken: 'api-token-1'
    });

    assert.strictEqual(headers.Accept, 'application/json');
    assert.strictEqual(headers.Authorization, 'Bearer api-token-1');
});

test('AuthenticationService uses SearchTokenService in searchToken mode', function () {
    var SearchTokenService = {
        requestSearchToken: function (authContext, settings) {
            assert.strictEqual(authContext.currentCustomer.profile.email, 'shopper@example.com');
            assert.strictEqual(settings.authMode, 'searchToken');
            return 'search-token-1';
        }
    };
    var AuthenticationService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/AuthenticationService.js'),
        {
            '*/cartridge/scripts/config/Config': {
                AUTH_MODES: {
                    API_KEY: 'apiKey',
                    SEARCH_TOKEN: 'searchToken'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/SearchTokenService': SearchTokenService
        }
    );
    var headers = AuthenticationService.buildHeaders({}, {
        authMode: 'searchToken'
    }, {
        currentCustomer: {
            profile: {
                email: 'shopper@example.com'
            }
        }
    });

    assert.strictEqual(headers.Authorization, 'Bearer search-token-1');
});

test('SearchTokenService caches generated search tokens by shopper identity', function () {
    var callCount = 0;
    var SearchTokenService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/SearchTokenService.js'),
        {
            'dw/crypto/Encoding': {
                toBase64: function (value) {
                    return Buffer.from(value, 'utf8').toString('base64');
                }
            },
            'dw/crypto/MessageDigest': function () {
                this.updateBytes = function (value) {
                    this.value = value;
                };
                this.digest = function () {
                    return Buffer.from(this.value, 'utf8').toString('hex');
                };
            },
            '*/cartridge/scripts/services/LocalServiceClient': {
                call: function (serviceId, options) {
                    callCount += 1;
                    assert.strictEqual(serviceId, 'coveo.http.search.token');
                    assert.strictEqual(options.method, 'POST');
                    assert.strictEqual(options.headers.Authorization, 'Bearer private-key-1');

                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            token: 'cached-token'
                        })
                    };
                }
            },
            '*/cartridge/scripts/config/Config': {
                SERVICE_IDS: {
                    SEARCH_TOKEN: 'coveo.http.search.token'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                info: function () {},
                error: function () {},
                warn: function () {}
            }
        }
    );
    var settings = {
        organizationId: 'org-1',
        authenticatedSearchApiKey: 'private-key-1',
        searchTokenValidityMillis: 3600000,
        searchTokenSecurityProvider: 'Email Security Provider',
        searchTokenUserType: 'User'
    };
    var authContext = {
        currentCustomer: {
            profile: {
                email: 'shopper@example.com'
            }
        },
        session: {
            privacy: {}
        }
    };

    assert.strictEqual(SearchTokenService.requestSearchToken(authContext, settings), 'cached-token');
    assert.strictEqual(SearchTokenService.requestSearchToken(authContext, settings), 'cached-token');
    assert.strictEqual(callCount, 1);
});

test('LocalServiceClient uses LocalServiceRegistry to build HTTP requests', function () {
    var capturedServiceId = '';
    var capturedMethod = '';
    var capturedUrl = '';
    var capturedHeaders = {};
    var capturedPayload = '';
    var capturedTimeout = 0;
    var LocalServiceClient = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/LocalServiceClient.js'),
        {
            'dw/svc/LocalServiceRegistry': {
                createService: function (serviceId, callbacks) {
                    var client = {
                        statusCode: 200,
                        text: '{"token":"service-token"}',
                        timeout: 0,
                        setTimeout: function (value) {
                            this.timeout = value;
                            capturedTimeout = value;
                        },
                        getAllResponseHeaders: function () {
                            return {
                                'Content-Type': 'application/json'
                            };
                        }
                    };

                    capturedServiceId = serviceId;

                    return {
                        setAuthentication: function () {},
                        setRequestMethod: function (value) {
                            capturedMethod = value;
                        },
                        setURL: function (value) {
                            capturedUrl = value;
                        },
                        setEncoding: function () {},
                        addHeader: function (name, value) {
                            capturedHeaders[name] = value;
                        },
                        getClient: function () {
                            return client;
                        },
                        call: function (requestData) {
                            capturedPayload = callbacks.createRequest(this, requestData);

                            return {
                                ok: true,
                                object: callbacks.parseResponse(this, client)
                            };
                        }
                    };
                }
            }
        }
    );
    var response = LocalServiceClient.call('coveo.http.commerce.api', {
        name: 'search',
        method: 'POST',
        url: 'https://platform.cloud.coveo.com/rest/search',
        headers: {
            Authorization: 'Bearer commerce-token',
            'Content-Type': 'application/json'
        },
        body: {
            query: 'chien'
        },
        timeout: 3000
    });

    assert.strictEqual(capturedServiceId, 'coveo.http.commerce.api');
    assert.strictEqual(capturedMethod, 'POST');
    assert.strictEqual(capturedUrl, 'https://platform.cloud.coveo.com/rest/search');
    assert.strictEqual(capturedHeaders.Authorization, 'Bearer commerce-token');
    assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
    assert.strictEqual(capturedPayload, JSON.stringify({
        query: 'chien'
    }));
    assert.strictEqual(capturedTimeout, 3000);
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.body, '{"token":"service-token"}');
});

test('GtmHelper builds search payload with response metadata', function () {
    var GtmHelper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/GtmHelper.js'));
    var payload = GtmHelper.buildSearchResponseEvent({
        query: 'chien',
        responseId: 'response-1',
        queryUid: 'query-1',
        analytics: {
            searchHub: 'storefront',
            pipeline: 'commerce-search'
        }
    }, {
        query: 'chien'
    });

    assert.strictEqual(payload.event, 'coveoSearchResponse');
    assert.strictEqual(payload.query, 'chien');
    assert.strictEqual(payload.responseId, 'response-1');
    assert.strictEqual(payload.queryUid, 'query-1');
    assert.strictEqual(payload.searchHub, 'storefront');
    assert.strictEqual(payload.pipeline, 'commerce-search');
});

test('GtmHelper builds recommendation payload with response metadata', function () {
    var GtmHelper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/GtmHelper.js'));
    var payload = GtmHelper.buildRecommendationResponseEvent({
        responseId: 'response-2'
    }, {
        slotId: 'slot-home'
    });

    assert.strictEqual(payload.event, 'coveoRecommendationResponse');
    assert.strictEqual(payload.responseId, 'response-2');
    assert.strictEqual(payload.recommendationId, 'slot-home');
});

test('CommerceApiService.search attaches sanitized debug snapshot when coveoDebug is enabled', function () {
    var SearchResultMapper = {
        map: function (rawResponse, params, analyticsContext) {
            return {
                products: [],
                responseId: rawResponse.responseId,
                queryUid: rawResponse.queryUid,
                analytics: analyticsContext
            };
        }
    };
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {
                        trackingId: 'storefront'
                    };
                },
                validateSettings: function () {
                    return [];
                }
            },
            '*/cartridge/scripts/helpers/QueryBuilder': {
                buildSearchPayload: function () {
                    return {
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: 'chien',
                        perPage: 24
                    };
                },
                buildListingPayload: function () {
                    return {};
                },
                buildQuerySuggestPayload: function () {
                    return {};
                },
                buildRecommendationsPayload: function () {
                    return {};
                },
                buildProductSuggestPayload: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/AnalyticsService': {
                buildRequestContext: function () {
                    return {
                        clientId: 'client-1'
                    };
                }
            },
            '*/cartridge/scripts/services/HttpClient': {
                request: function (options) {
                    assert.strictEqual(options.name, 'search');
                    assert.strictEqual(options.body.query, 'chien');
                    return {
                        statusCode: 200,
                        duration: 12,
                        data: {
                            responseId: 'response-1',
                            queryUid: 'query-1',
                            products: [],
                            facets: []
                        }
                    };
                }
            },
            '*/cartridge/scripts/mappers/SearchResultMapper': SearchResultMapper,
            '*/cartridge/scripts/mappers/ListingResultMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/RecommendationMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/ProductSuggestionMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/models/SearchResult': function (data) {
                return data;
            },
            '*/cartridge/models/ListingResult': function (data) {
                return data;
            },
            '*/cartridge/models/RecommendationResult': function (data) {
                return data;
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (apiEndpoint, endpointPath) {
                    return apiEndpoint + '/' + endpointPath;
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var result = CommerceApiService.search({
        query: 'chien',
        request: {
            httpHost: 'example.com'
        },
        coveoDebug: true
    });

    assert.strictEqual(result.responseId, 'response-1');
    assert.strictEqual(result.debug.request.query, 'chien');
    assert.strictEqual(result.debug.rawResponse.responseId, 'response-1');
});

test('CommerceApiService.productSuggest maps normalized products', function () {
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {
                        trackingId: 'storefront'
                    };
                },
                validateSettings: function () {
                    return [];
                }
            },
            '*/cartridge/scripts/helpers/QueryBuilder': {
                buildSearchPayload: function () {
                    return {};
                },
                buildListingPayload: function () {
                    return {};
                },
                buildQuerySuggestPayload: function () {
                    return {};
                },
                buildRecommendationsPayload: function () {
                    return {};
                },
                buildProductSuggestPayload: function (params) {
                    assert.strictEqual(params.query, 'croq');
                    return {
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: params.query
                    };
                }
            },
            '*/cartridge/scripts/services/AnalyticsService': {
                buildRequestContext: function () {
                    return {
                        clientId: 'client-1'
                    };
                }
            },
            '*/cartridge/scripts/services/HttpClient': {
                request: function (options) {
                    assert.strictEqual(options.name, 'productSuggest');
                    return {
                        data: {
                            items: [{
                                productId: 'sku-1'
                            }],
                            responseId: 'response-1',
                            queryUid: 'query-1'
                        }
                    };
                }
            },
            '*/cartridge/scripts/mappers/SearchResultMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/ListingResultMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/RecommendationMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/ProductSuggestionMapper': {
                map: function (rawResponse) {
                    return {
                        products: rawResponse.items,
                        responseId: rawResponse.responseId
                    };
                }
            },
            '*/cartridge/models/SearchResult': function (data) {
                return data;
            },
            '*/cartridge/models/ListingResult': function (data) {
                return data;
            },
            '*/cartridge/models/RecommendationResult': function (data) {
                return data;
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (apiEndpoint, endpointPath) {
                    return apiEndpoint + '/' + endpointPath;
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var result = CommerceApiService.productSuggest({
        query: 'croq'
    });

    assert.strictEqual(result.products.length, 1);
    assert.strictEqual(result.responseId, 'response-1');
});

test('CommerceApiService.querySuggest normalizes query suggestions', function () {
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {
                        trackingId: 'storefront'
                    };
                },
                validateSettings: function () {
                    return [];
                }
            },
            '*/cartridge/scripts/helpers/QueryBuilder': {
                buildSearchPayload: function () {
                    return {};
                },
                buildListingPayload: function () {
                    return {};
                },
                buildQuerySuggestPayload: function (params) {
                    return {
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: params.query
                    };
                },
                buildRecommendationsPayload: function () {
                    return {};
                },
                buildProductSuggestPayload: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/AnalyticsService': {
                buildRequestContext: function () {
                    return {
                        clientId: 'client-1'
                    };
                }
            },
            '*/cartridge/scripts/services/HttpClient': {
                request: function (options) {
                    assert.strictEqual(options.name, 'querySuggest');
                    return {
                        data: {
                            suggestions: ['chien', 'chiot'],
                            responseId: 'response-2',
                            queryUid: 'query-2'
                        }
                    };
                }
            },
            '*/cartridge/scripts/mappers/SearchResultMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/ListingResultMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/RecommendationMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/mappers/ProductSuggestionMapper': {
                map: function () {
                    return {};
                }
            },
            '*/cartridge/models/SearchResult': function (data) {
                return data;
            },
            '*/cartridge/models/ListingResult': function (data) {
                return data;
            },
            '*/cartridge/models/RecommendationResult': function (data) {
                return data;
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (apiEndpoint, endpointPath) {
                    return apiEndpoint + '/' + endpointPath;
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var result = CommerceApiService.querySuggest({
        query: 'chi'
    });

    assert.strictEqual(result.suggestions.length, 2);
    assert.strictEqual(result.responseId, 'response-2');
    assert.strictEqual(result.queryUid, 'query-2');
});

(function run() {
    var failures = 0;

    tests.forEach(function (entry) {
        try {
            entry.fn();
            console.log('ok - ' + entry.name);
        } catch (error) {
            failures += 1;
            console.error('not ok - ' + entry.name);
            console.error(error && error.stack ? error.stack : error);
        }
    });

    if (failures > 0) {
        process.exitCode = 1;
    }
}());
