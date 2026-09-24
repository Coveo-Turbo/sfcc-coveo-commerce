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
    var context;

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

        if (request.indexOf('*/cartridge/') === 0) {
            return loadModule(
                resolveLocalModule(
                    path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge'),
                    request.substring('*/cartridge/'.length)
                ),
                stubs,
                moduleCache
            );
        }

        return require(request);
    }

    context = {
        console: console,
        process: process,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout
    };

    if (stubs && stubs.globals) {
        Object.keys(stubs.globals).forEach(function (key) {
            context[key] = stubs.globals[key];
        });
    }

    vm.runInNewContext(
        '(function (exports, require, module, __filename, __dirname) {' + source + '\n})',
        context
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

test('QueryBuilder builds facet search payload with an empty query and Commerce context', function () {
    var QueryBuilder = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/QueryBuilder.js'));
    var payload = QueryBuilder.buildFacetSearchPayload({
        query: '',
        facetId: 'ec_brand',
        numberOfValues: 5,
        currentUrl: 'https://example.com/mondou/search',
        context: {
            custom: {
                applyBestSellerSort: true
            },
            source: ['groupe-legault-commerce-poc@0.1.0']
        }
    }, {
        trackingId: 'mondou',
        language: 'en',
        country: 'CA',
        currency: 'CAD'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(payload.clientId, 'client-1');
    assert.strictEqual(payload.trackingId, 'mondou');
    assert.strictEqual(payload.query, '');
    assert.strictEqual(payload.facetId, 'ec_brand');
    assert.strictEqual(payload.numberOfValues, 5);
    assert.strictEqual(payload.language, 'en');
    assert.strictEqual(payload.country, 'CA');
    assert.strictEqual(payload.currency, 'CAD');
    assert.strictEqual(payload.context.view.url, 'https://example.com/mondou/search');
    assert.strictEqual(payload.context.custom.applyBestSellerSort, true);
    assert.strictEqual(payload.context.source[0], 'groupe-legault-commerce-poc@0.1.0');
});

test('QuerySuggestionMapper preserves completions and CMH field suggestion facets', function () {
    var QuerySuggestionMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/QuerySuggestionMapper.js'));
    var mapped = QuerySuggestionMapper.map({
        responseId: 'response-1',
        completions: [{
            expression: 'dog',
            highlighted: '[dog]'
        }, {
            expression: 'cat litter',
            highlighted: '[cat] [litter]'
        }, {
            expression: 'what b',
            highlighted: '[what] [b]'
        }, {
            expression: 'vêt diète',
            highlighted: '[vêt] [diète]'
        }, {
            expression: 'vetdiet freeze chicken',
            highlighted: '[vetdiet] [freeze] [chicken]'
        }],
        fieldSuggestionsFacets: [{
            facetId: 'ec_brand',
            field: 'ec_brand',
            displayName: 'Brand',
            type: 'regular'
        }]
    }, {
        clientId: 'client-1',
        searchHub: 'storefront',
        pipeline: 'commerce-search'
    });

    assert.strictEqual(mapped.suggestions.length, 5);
    assert.strictEqual(mapped.suggestions[0].value, 'dog');
    assert.strictEqual(mapped.suggestions[3].value, 'vêt diète');
    assert.strictEqual(mapped.suggestions[4].highlighted, '[vetdiet] [freeze] [chicken]');
    assert.strictEqual(mapped.fieldSuggestionsFacets.length, 1);
    assert.strictEqual(mapped.fieldSuggestionsFacets[0].facetId, 'ec_brand');
    assert.strictEqual(mapped.fieldSuggestionsFacets[0].field, 'ec_brand');
    assert.strictEqual(mapped.fieldSuggestionsFacets[0].displayName, 'Brand');
    assert.strictEqual(mapped.fieldSuggestionsFacets[0].type, 'regular');
    assert.strictEqual(mapped.responseId, 'response-1');
    assert.strictEqual(mapped.queryUid, '');
    assert.strictEqual(mapped.analytics.clientId, 'client-1');

    mapped = QuerySuggestionMapper.map({
        completions: []
    }, {});
    assert.strictEqual(mapped.fieldSuggestionsFacets.length, 0);
});

test('FacetSearchMapper preserves Coveo facet values and availability', function () {
    var FacetSearchMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/FacetSearchMapper.js'));
    var mapped = FacetSearchMapper.map({
        values: [{
            displayValue: 'Hero Dog Treats',
            rawValue: 'Hero Dog Treats',
            path: [],
            count: 49
        }, {
            displayValue: 'Kong',
            rawValue: 'Kong',
            path: [],
            count: 104
        }],
        moreValuesAvailable: true
    }, {
        facetId: 'ec_brand'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(mapped.facetId, 'ec_brand');
    assert.strictEqual(mapped.values.length, 2);
    assert.strictEqual(mapped.values[0].displayValue, 'Hero Dog Treats');
    assert.strictEqual(mapped.values[0].count, 49);
    assert.strictEqual(mapped.values[1].rawValue, 'Kong');
    assert.strictEqual(mapped.moreValuesAvailable, true);
    assert.strictEqual(mapped.analytics.clientId, 'client-1');
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

test('ProductMapper falls back to regular price when promotional price is null', function () {
    var ProductMapper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/mappers/ProductMapper.js'));
    var mapped = ProductMapper.map({
        ec_product_id: 'sku-1',
        ec_promo_price: null,
        ec_price: 50.49
    });

    assert.strictEqual(mapped.price, 50.49);
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

test('SearchTokenService caches generated search tokens by shopper identity', function () {
    var callCount = 0;
    var SearchTokenService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/SearchTokenService.js'),
        {
            '*/cartridge/scripts/services/CoveoSearchTokenHttpService': {
                request: function (payload, settings) {
                    callCount += 1;
                    assert.strictEqual(settings.organizationId, 'org-1');
                    assert.strictEqual(payload.userIds[0].name, 'shopper@example.com');

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

test('CoveoSearchTokenHttpService uses LocalServiceRegistry credentials', function () {
    var capturedServiceId = '';
    var capturedUrl = '';
    var capturedHeaders = {};
    var capturedPayload = '';
    var SearchTokenHttpService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoSearchTokenHttpService.js'),
        {
            'dw/svc/LocalServiceRegistry': {
                createService: function (serviceId, callbacks) {
                    var client = {
                        statusCode: 200,
                        text: '{"token":"service-token"}',
                        getAllResponseHeaders: function () {
                            return {
                                'Content-Type': 'application/json'
                            };
                        }
                    };

                    capturedServiceId = serviceId;

                    return {
                        setAuthentication: function () {},
                        setRequestMethod: function () {},
                        setURL: function (value) {
                            capturedUrl = value;
                        },
                        setEncoding: function () {},
                        addHeader: function (name, value) {
                            capturedHeaders[name] = value;
                        },
                        getConfiguration: function () {
                            return {
                                getCredential: function () {
                                    return {
                                        getURL: function () {
                                            return 'https://org-1.org.coveo.com';
                                        },
                                        getPassword: function () {
                                            return 'private-key-1';
                                        }
                                    };
                                }
                            };
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
            },
            '*/cartridge/scripts/config/Config': {
                SERVICE_IDS: {
                    SEARCH_TOKEN: 'coveo.http.search.token'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/CoveoServiceSupport': loadModule(
                path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoServiceSupport.js'),
                {}
            ),
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (baseUrl, endpointPath) {
                    return baseUrl.replace(/\/+$/, '') + '/' + endpointPath;
                }
            }
        }
    );
    var response = SearchTokenHttpService.request({
        userIds: [{
            name: 'shopper@example.com'
        }]
    }, {
        organizationId: 'org-1'
    });

    assert.strictEqual(capturedServiceId, 'coveo.http.search.token');
    assert.strictEqual(capturedUrl, 'https://org-1.org.coveo.com/rest/search/token');
    assert.strictEqual(capturedHeaders.Authorization, 'Bearer private-key-1');
    assert.strictEqual(capturedHeaders.Accept, 'text/plain, application/json');
    assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
    assert.strictEqual(capturedPayload, JSON.stringify({
        userIds: [{
            name: 'shopper@example.com'
        }]
    }));
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.body, '{"token":"service-token"}');
});

test('CoveoCommerceHttpService uses service credentials and structured facet query parameters', function () {
    var capturedServiceId = '';
    var capturedUrl = '';
    var capturedHeaders = {};
    var capturedPayload = '';
    var CommerceHttpService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoCommerceHttpService.js'),
        {
            'dw/svc/LocalServiceRegistry': {
                createService: function (serviceId, callbacks) {
                    var client = {
                        statusCode: 200,
                        text: '{"values":[],"moreValuesAvailable":false}',
                        getAllResponseHeaders: function () {
                            return {
                                'Content-Type': 'application/json'
                            };
                        }
                    };

                    capturedServiceId = serviceId;

                    return {
                        setAuthentication: function () {},
                        setRequestMethod: function () {},
                        setURL: function (value) {
                            capturedUrl = value;
                        },
                        setEncoding: function () {},
                        addHeader: function (name, value) {
                            capturedHeaders[name] = value;
                        },
                        getConfiguration: function () {
                            return {
                                getCredential: function () {
                                    return {
                                        getURL: function () {
                                            return 'https://platform.cloud.coveo.com';
                                        },
                                        getPassword: function () {
                                            return 'credential-api-token';
                                        }
                                    };
                                }
                            };
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
            },
            '*/cartridge/scripts/config/Config': {
                AUTH_MODES: {
                    API_KEY: 'apiKey',
                    SEARCH_TOKEN: 'searchToken'
                },
                SERVICE_IDS: {
                    COMMERCE_API: 'coveo.http.commerce.api'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/SearchTokenService': {
                requestSearchToken: function () {
                    throw new Error('Search token flow should not be used in apiKey mode.');
                }
            },
            '*/cartridge/scripts/services/CoveoServiceSupport': loadModule(
                path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoServiceSupport.js'),
                {}
            ),
            '*/cartridge/scripts/helpers/UrlHelper': require(
                path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/UrlHelper.js')
            ),
            '*/cartridge/scripts/helpers/Logger': {
                info: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var response = CommerceHttpService.request({
        name: 'facetSearch',
        endpointPath: 'facet',
        queryParams: {
            type: 'SEARCH'
        },
        settings: {
            organizationId: 'org-1',
            authMode: 'apiKey',
            retryCount: 0
        },
        body: {
            query: '',
            facetId: 'ec_brand'
        }
    });

    assert.strictEqual(capturedServiceId, 'coveo.http.commerce.api');
    assert.strictEqual(capturedUrl, 'https://platform.cloud.coveo.com/rest/organizations/org-1/commerce/v2/facet?type=SEARCH');
    assert.strictEqual(capturedHeaders.Authorization, 'Bearer credential-api-token');
    assert.strictEqual(capturedHeaders.Accept, 'application/json');
    assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
    assert.strictEqual(capturedPayload, JSON.stringify({
        query: '',
        facetId: 'ec_brand'
    }));
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.ok, true);
    assert.strictEqual(response.data.moreValuesAvailable, false);
});

test('CoveoCommerceHttpService uses SearchTokenService in searchToken mode', function () {
    var capturedAuthorization = '';
    var capturedUrl = '';
    var CommerceHttpService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoCommerceHttpService.js'),
        {
            'dw/svc/LocalServiceRegistry': {
                createService: function (serviceId, callbacks) {
                    var client = {
                        statusCode: 200,
                        text: '{"responseId":"response-1"}',
                        getAllResponseHeaders: function () {
                            return {};
                        }
                    };

                    return {
                        setAuthentication: function () {},
                        setRequestMethod: function () {},
                        setURL: function (value) {
                            capturedUrl = value;
                        },
                        setEncoding: function () {},
                        addHeader: function (name, value) {
                            if (name === 'Authorization') {
                                capturedAuthorization = value;
                            }
                        },
                        getConfiguration: function () {
                            return {
                                getCredential: function () {
                                    return {
                                        getURL: function () {
                                            return 'https://platform.cloud.coveo.com';
                                        },
                                        getPassword: function () {
                                            return '';
                                        }
                                    };
                                }
                            };
                        },
                        getClient: function () {
                            return client;
                        },
                        call: function (requestData) {
                            callbacks.createRequest(this, requestData);

                            return {
                                ok: true,
                                object: callbacks.parseResponse(this, client)
                            };
                        }
                    };
                }
            },
            '*/cartridge/scripts/config/Config': {
                AUTH_MODES: {
                    API_KEY: 'apiKey',
                    SEARCH_TOKEN: 'searchToken'
                },
                SERVICE_IDS: {
                    COMMERCE_API: 'coveo.http.commerce.api'
                },
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/services/SearchTokenService': {
                requestSearchToken: function (authContext, settings) {
                    assert.strictEqual(authContext.currentCustomer.profile.email, 'shopper@example.com');
                    assert.strictEqual(settings.authMode, 'searchToken');
                    return 'search-token-1';
                }
            },
            '*/cartridge/scripts/services/CoveoServiceSupport': loadModule(
                path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CoveoServiceSupport.js'),
                {}
            ),
            '*/cartridge/scripts/helpers/UrlHelper': require(
                path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/UrlHelper.js')
            ),
            '*/cartridge/scripts/helpers/Logger': {
                info: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );

    CommerceHttpService.request({
        name: 'facetSearch',
        endpointPath: 'facet',
        queryParams: {
            type: 'SEARCH'
        },
        settings: {
            organizationId: 'org-1',
            authMode: 'searchToken',
            retryCount: 0
        },
        authContext: {
            currentCustomer: {
                profile: {
                    email: 'shopper@example.com'
                }
            }
        },
        body: {
            query: '',
            facetId: 'ec_brand'
        }
    });

    assert.strictEqual(capturedAuthorization, 'Bearer search-token-1');
    assert.strictEqual(capturedUrl, 'https://platform.cloud.coveo.com/rest/organizations/org-1/commerce/v2/facet?type=SEARCH');
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
            '*/cartridge/scripts/services/CoveoCommerceHttpService': {
                request: function (options) {
                    assert.strictEqual(options.name, 'search');
                    assert.strictEqual(options.endpointPath, 'search');
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
            '*/cartridge/scripts/services/CoveoCommerceHttpService': {
                request: function (options) {
                    assert.strictEqual(options.name, 'productSuggest');
                    assert.strictEqual(options.endpointPath, 'search/productSuggest');
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
                buildFacetSearchPayload: function (params) {
                    return {
                        trackingId: 'mondou',
                        clientId: 'client-1',
                        language: 'en',
                        country: 'CA',
                        currency: 'CAD',
                        query: params.query || '',
                        facetId: params.facetId,
                        numberOfValues: 5,
                        context: {
                            view: {
                                url: 'https://example.com/mondou/search'
                            }
                        }
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
            '*/cartridge/scripts/services/CoveoCommerceHttpService': {
                request: function (options) {
                    if (options.name === 'facetSearch') {
                        assert.strictEqual(options.endpointPath, 'facet');
                        assert.strictEqual(options.queryParams.type, 'SEARCH');
                        assert.strictEqual(options.body.query, '');
                        assert.strictEqual(options.body.facetId, 'ec_brand');
                        return {
                            data: {
                                values: [{
                                    displayValue: 'Hero Dog Treats',
                                    rawValue: 'Hero Dog Treats',
                                    path: [],
                                    count: 49
                                }, {
                                    displayValue: 'Kong',
                                    rawValue: 'Kong',
                                    path: [],
                                    count: 104
                                }, {
                                    displayValue: 'CaniSource',
                                    rawValue: 'CaniSource',
                                    path: [],
                                    count: 65
                                }, {
                                    displayValue: 'Envirowise',
                                    rawValue: 'Envirowise',
                                    path: [],
                                    count: 2
                                }, {
                                    displayValue: 'BeOneBreed',
                                    rawValue: 'BeOneBreed',
                                    path: [],
                                    count: 109
                                }],
                                moreValuesAvailable: true
                            }
                        };
                    }

                    assert.strictEqual(options.name, 'querySuggest');
                    assert.strictEqual(options.endpointPath, 'search/querySuggest');
                    return {
                        data: {
                            completions: [{
                                expression: 'dog',
                                highlighted: '[dog]'
                            }],
                            fieldSuggestionsFacets: [{
                                facetId: 'ec_brand',
                                field: 'ec_brand',
                                displayName: 'Brand',
                                type: 'regular'
                            }],
                            responseId: 'response-2'
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
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var result = CommerceApiService.querySuggest({
        query: ''
    });

    assert.strictEqual(result.suggestions.length, 1);
    assert.strictEqual(result.suggestions[0].value, 'dog');
    assert.strictEqual(result.fieldSuggestionsFacets.length, 1);
    assert.strictEqual(result.fieldSuggestionsFacets[0].facetId, 'ec_brand');
    assert.strictEqual(result.responseId, 'response-2');
    assert.strictEqual(result.queryUid, '');

    result = CommerceApiService.facetSearch({
        query: '',
        facetId: 'ec_brand'
    });

    assert.strictEqual(result.facetId, 'ec_brand');
    assert.strictEqual(result.values.length, 5);
    assert.strictEqual(result.values[0].displayValue, 'Hero Dog Treats');
    assert.strictEqual(result.values[4].displayValue, 'BeOneBreed');
    assert.strictEqual(result.moreValuesAvailable, true);

    assert.throws(function () {
        CommerceApiService.facetSearch({
            query: '',
            facetId: {
                invalid: true
            }
        });
    }, /facetId/);
});

test('Search controller exposes field suggestion facets and standalone facet values', function () {
    var routes = {};
    var jsonResponse;
    var statusCode = 200;
    var facetCallCount = 0;
    var controller = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/controllers/Search.js'),
        {
            globals: {
                request: {
                    httpReferer: 'https://example.com/search?q=dog',
                    httpURL: {
                        toString: function () {
                            return 'https://example.com/Search-Facet';
                        }
                    }
                },
                response: {}
            },
            server: {
                get: function (name, handler) {
                    routes[name] = handler;
                },
                exports: function () {
                    return routes;
                }
            },
            '*/cartridge/scripts/services/CommerceApiService': {
                querySuggest: function () {
                    return {
                        suggestions: [{
                            value: 'dog'
                        }],
                        fieldSuggestionsFacets: [{
                            facetId: 'ec_brand',
                            field: 'ec_brand',
                            displayName: 'Brand',
                            type: 'regular'
                        }],
                        responseId: 'response-1',
                        queryUid: '',
                        analytics: {}
                    };
                },
                facetSearch: function (params) {
                    facetCallCount += 1;
                    assert.strictEqual(typeof params.userId, 'undefined');
                    assert.strictEqual(params.currentUrl, 'https://example.com/search?q=dog');

                    if (params.facetId === 'throws') {
                        throw new Error('Bearer secret must not be exposed.');
                    }

                    assert.strictEqual(params.facetId, 'ec_brand');
                    assert.strictEqual(params.context.custom.applyBestSellerSort, true);
                    return {
                        facetId: 'ec_brand',
                        values: [{
                            displayValue: 'Kong',
                            rawValue: 'Kong',
                            path: [],
                            count: 104
                        }],
                        moreValuesAvailable: true,
                        analytics: {}
                    };
                }
            },
            '*/cartridge/models/SearchResult': function () {},
            '*/cartridge/scripts/helpers/GtmHelper': {
                buildQuerySuggestResponseEvent: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                error: function () {}
            }
        }
    );
    var res = {
        json: function (value) {
            jsonResponse = value;
        },
        setStatusCode: function (value) {
            statusCode = value;
        }
    };
    var next = function () {};
    var suggestRoute = controller.Suggest;
    var facetRoute = controller.Facet;

    suggestRoute({
        querystring: {
            q: ''
        }
    }, res, next);
    assert.strictEqual(jsonResponse.fieldSuggestionsFacets[0].facetId, 'ec_brand');

    facetRoute({
        querystring: {
            q: '',
            facetId: 'ec_brand',
            numberOfValues: '5',
            context: '{"custom":{"applyBestSellerSort":true}}',
            userId: 'attacker@example.com',
            endpointPath: 'untrusted'
        }
    }, res, next);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResponse.facetId, 'ec_brand');
    assert.strictEqual(jsonResponse.values[0].displayValue, 'Kong');
    assert.strictEqual(jsonResponse.moreValuesAvailable, true);
    assert.strictEqual(facetCallCount, 1);

    statusCode = 200;
    facetRoute({
        querystring: {
            q: '',
            facetId: 'ec_brand',
            numberOfValues: '5junk'
        }
    }, res, next);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.error, true);
    assert.strictEqual(facetCallCount, 1);

    statusCode = 200;
    facetRoute({
        querystring: {
            q: '',
            facetId: 'ec_brand',
            numberOfValues: '5',
            context: '{invalid}'
        }
    }, res, next);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.message, 'context must contain valid JSON.');
    assert.strictEqual(facetCallCount, 1);

    statusCode = 200;
    facetRoute({
        querystring: {
            q: '',
            facetId: 'throws',
            numberOfValues: '5'
        }
    }, res, next);
    assert.strictEqual(statusCode, 502);
    assert.strictEqual(jsonResponse.message, 'Unable to retrieve Coveo facet values.');
    assert.strictEqual(jsonResponse.message.indexOf('Bearer secret'), -1);
    assert.strictEqual(facetCallCount, 2);
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
