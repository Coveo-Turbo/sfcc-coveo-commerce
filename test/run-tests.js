'use strict';

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
                    return 'https://example.com/s/Mondou_CA/fr-CA/search';
                }
            },
            httpQueryString: 'q=chien',
            httpUserAgent: 'Mozilla/5.0',
            httpReferer: 'https://example.com/'
        }
    }, {
        trackingId: 'mondou_ca',
        language: 'en',
        country: 'US',
        currency: 'USD'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(payload.trackingId, 'mondou_ca');
    assert.strictEqual(payload.clientId, 'client-1');
    assert.strictEqual(payload.language, 'fr');
    assert.strictEqual(payload.country, 'CA');
    assert.strictEqual(payload.currency, 'CAD');
    assert.strictEqual(payload.query, 'chien');
    assert.strictEqual(payload.context.view.url, 'https://example.com/s/Mondou_CA/fr-CA/search?q=chien');
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
            ec_brand: 'Mondou'
        }],
        responseId: 'response-1',
        queryUid: 'query-1'
    }, {}, {
        clientId: 'client-1',
        searchHub: 'mondou_storefront',
        pipeline: 'mondou-search'
    });

    assert.strictEqual(mapped.products.length, 1);
    assert.strictEqual(mapped.products[0].id, 'sku-1');
    assert.strictEqual(mapped.products[0].brand, 'Mondou');
    assert.strictEqual(mapped.responseId, 'response-1');
    assert.strictEqual(mapped.analytics.clientId, 'client-1');
    assert.strictEqual(mapped.analytics.queryUid, 'query-1');
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

test('SearchTokenService caches search tokens per session context', function () {
    var sendCount = 0;
    var cache = {};
    var SearchTokenService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/SearchTokenService.js'),
        {
            'dw/net/HTTPClient': function HTTPClient() {
                this.open = function () {};
                this.setTimeout = function () {};
                this.setRequestHeader = function () {};
                this.send = function () {
                    sendCount += 1;
                    this.statusCode = 200;
                    this.text = JSON.stringify({
                        token: 'search-token-' + sendCount
                    });
                };
                this.getStatusCode = function () {
                    return this.statusCode;
                };
                this.getText = function () {
                    return this.text;
                };
            },
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {};
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                info: function () {},
                warn: function () {},
                error: function () {}
            }
        }
    );
    var context = {
        currentCustomer: {
            profile: {
                email: 'shopper@example.com'
            }
        },
        session: {
            privacyCache: {
                get: function (key) {
                    return cache[key] || null;
                },
                set: function (key, value) {
                    cache[key] = value;
                }
            }
        }
    };
    var settings = {
        organizationId: 'acme',
        authenticatedSearchApiKey: 'search-api-key',
        timeoutMillis: 5000,
        searchTokenSecurityProvider: 'Email Security Provider',
        searchTokenUserType: 'User',
        searchTokenValidityMillis: 60000
    };

    assert.strictEqual(SearchTokenService.requestSearchToken(context, settings), 'search-token-1');
    assert.strictEqual(SearchTokenService.requestSearchToken(context, settings), 'search-token-1');
    assert.strictEqual(sendCount, 1);
});

test('GtmHelper builds query and product suggestion events with response metadata', function () {
    var GtmHelper = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/GtmHelper.js'));
    var querySuggestEvent = GtmHelper.buildQuerySuggestResponseEvent({
        responseId: 'query-response-id',
        queryUid: 'query-uid',
        analytics: {
            clientId: 'client-1',
            searchHub: 'mondou_storefront',
            pipeline: 'mondou-search'
        }
    }, {
        query: 'chien',
        surface: 'mondouSearchBoxSuggest',
        source: 'app_mondou_coveo'
    });
    var productSuggestEvent = GtmHelper.buildProductSuggestResponseEvent({
        responseId: 'product-response-id',
        queryUid: 'product-query-uid',
        analytics: {
            clientId: 'client-1',
            searchHub: 'mondou_storefront',
            pipeline: 'mondou-search'
        }
    }, {
        query: 'chien',
        surface: 'mondouSearchBoxPreview',
        source: 'app_mondou_coveo'
    });

    assert.strictEqual(querySuggestEvent.event, 'coveoQuerySuggestResponse');
    assert.strictEqual(querySuggestEvent.operation, 'querySuggest');
    assert.strictEqual(querySuggestEvent.responseId, 'query-response-id');
    assert.strictEqual(querySuggestEvent.searchQueryUid, 'query-uid');
    assert.strictEqual(querySuggestEvent.surface, 'mondouSearchBoxSuggest');
    assert.strictEqual(productSuggestEvent.event, 'coveoProductSuggestResponse');
    assert.strictEqual(productSuggestEvent.operation, 'productSuggest');
    assert.strictEqual(productSuggestEvent.responseId, 'product-response-id');
    assert.strictEqual(productSuggestEvent.searchQueryUid, 'product-query-uid');
    assert.strictEqual(productSuggestEvent.surface, 'mondouSearchBoxPreview');
});

test('Mondou search box helper returns GTM payloads for bootstrap, suggest, and preview responses', function () {
    var SearchBoxHelper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchBoxHelpers.js'),
        {
            'dw/system/Site': {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return 'slot-homepage';
                        }
                    };
                }
            },
            'dw/web/URLUtils': {
                url: function (routeName) {
                    return {
                        toString: function () {
                            return '/' + routeName;
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/AnalyticsService': {
                ensureClientId: function () {
                    return 'client-1';
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/CommerceApiService': {
                querySuggest: function (params) {
                    return {
                        suggestions: [{
                            value: params.query || 'croquettes'
                        }],
                        responseId: 'query-response-id',
                        queryUid: 'query-uid',
                        analytics: {
                            clientId: 'client-1',
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        }
                    };
                },
                recommendations: function () {
                    return {
                        recommendations: [{
                            id: 'sku-1',
                            name: 'Croquettes',
                            url: '/p/croquettes',
                            image: 'https://images.example.com/croquettes.jpg',
                            price: 19.99,
                            brand: 'Mondou'
                        }],
                        responseId: 'recommendation-response-id',
                        analytics: {
                            clientId: 'client-1',
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        }
                    };
                },
                productSuggest: function () {
                    return {
                        products: [{
                            id: 'sku-2',
                            name: 'Patee',
                            url: '/p/patee',
                            image: 'https://images.example.com/patee.jpg',
                            price: 9.99,
                            brand: 'Mondou'
                        }],
                        responseId: 'product-response-id',
                        queryUid: 'product-query-uid',
                        analytics: {
                            clientId: 'client-1',
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/GtmHelper.js')),
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var bootstrap = SearchBoxHelper.buildBootstrapResponse({
        querystring: {},
        currentCustomer: {}
    });
    var suggest = SearchBoxHelper.buildSuggestResponse({
        querystring: {
            q: 'chien'
        },
        currentCustomer: {}
    });
    var preview = SearchBoxHelper.buildPreviewResponse({
        querystring: {
            q: 'chien'
        },
        currentCustomer: {}
    });

    assert.strictEqual(bootstrap.dataLayer.length, 2);
    assert.strictEqual(bootstrap.dataLayer[0].operation, 'querySuggest');
    assert.strictEqual(bootstrap.dataLayer[1].operation, 'recommendation');
    assert.strictEqual(suggest.dataLayer.operation, 'querySuggest');
    assert.strictEqual(suggest.dataLayer.responseId, 'query-response-id');
    assert.strictEqual(preview.dataLayer.operation, 'productSuggest');
    assert.strictEqual(preview.dataLayer.responseId, 'product-response-id');
});

test('Mondou Coveo search helper parses selected facet filters from querystring preferences', function () {
    var capturedParams = null;
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/ProductMgr': {
                getProduct: function () {
                    return null;
                }
            },
            'dw/system/Site': {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return [];
                        }
                    };
                }
            },
            'dw/web/URLUtils': {
                url: function (routeName) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var pairs = [];
                    var index;

                    for (index = 0; index < args.length; index += 2) {
                        pairs.push(
                            encodeURIComponent(String(args[index])) + '=' +
                            encodeURIComponent(String(args[index + 1]))
                        );
                    }

                    return {
                        toString: function () {
                            return '/' + routeName + (pairs.length ? '?' + pairs.join('&') : '');
                        }
                    };
                }
            },
            '*/cartridge/config/preferences': {
                defaultPageSize: 24
            },
            '*/cartridge/scripts/factories/product': {
                get: function () {
                    return null;
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/CommerceApiService': {
                search: function (params) {
                    capturedParams = params;

                    return {
                        products: [],
                        facets: [{
                            id: 'brand',
                            label: 'Brand',
                            type: 'regular',
                            values: [{
                                id: 'Chat',
                                label: 'Chat',
                                count: 12,
                                selected: true
                            }]
                        }],
                        pagination: {
                            total: 12
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'response-1',
                        queryUid: 'query-1',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        },
                        raw: {
                            facets: [{
                                facetId: 'brand',
                                field: 'ec_animal_type',
                                values: [{
                                    id: 'Chat',
                                    value: 'chat',
                                    displayValue: 'Chat',
                                    numberOfResults: 12,
                                    state: 'selected'
                                }]
                            }]
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );

    var result = helper.search({
        querystring: {
            q: 'chien',
            preferences: {
                ec_animal_type: 'chat'
            }
        },
        currentCustomer: {}
    });

    assert.ok(capturedParams);
    assert.strictEqual(capturedParams.query, 'chien');
    assert.strictEqual(capturedParams.filters.ec_animal_type[0], 'chat');
    assert.strictEqual(result.productSearch.selectedFilters.length, 1);
    assert.strictEqual(result.productSearch.selectedFilters[0].displayValue, 'Chat');
});

test('Mondou Coveo search helper preserves existing preferences while building facet toggle urls', function () {
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/ProductMgr': {
                getProduct: function () {
                    return null;
                }
            },
            'dw/system/Site': {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return [];
                        }
                    };
                }
            },
            'dw/web/URLUtils': {
                url: function (routeName) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var pairs = [];
                    var index;

                    for (index = 0; index < args.length; index += 2) {
                        pairs.push(
                            encodeURIComponent(String(args[index])) + '=' +
                            encodeURIComponent(String(args[index + 1]))
                        );
                    }

                    return {
                        toString: function () {
                            return '/' + routeName + (pairs.length ? '?' + pairs.join('&') : '');
                        }
                    };
                }
            },
            '*/cartridge/config/preferences': {
                defaultPageSize: 24
            },
            '*/cartridge/scripts/factories/product': {
                get: function () {
                    return null;
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/CommerceApiService': {
                search: function () {
                    return {
                        products: [],
                        facets: [{
                            id: 'brand',
                            label: 'Brand',
                            type: 'regular',
                            values: [{
                                id: 'Chat',
                                label: 'Chat',
                                count: 12,
                                selected: false
                            }]
                        }],
                        pagination: {
                            total: 12
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'response-1',
                        queryUid: 'query-1',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        },
                        raw: {
                            facets: [{
                                facetId: 'brand',
                                field: 'ec_animal_type',
                                values: [{
                                    id: 'Chat',
                                    value: 'chat',
                                    displayValue: 'Chat',
                                    numberOfResults: 12,
                                    state: 'idle'
                                }]
                            }]
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var result = helper.search({
        querystring: {
            q: 'chien',
            preferences: {
                brand: 'should-not-leak'
            }
        },
        currentCustomer: {}
    });
    var value = result.productSearch.refinements[0].values[0];

    assert.strictEqual(
        value.url,
        '/Search-ShowAjax?q=chien&prefn1=brand&prefv1=should-not-leak&prefn2=ec_animal_type&prefv2=chat'
    );
    assert.strictEqual(value.displayValue, 'Chat');
    assert.strictEqual(value.selected, false);
});

test('Mondou Coveo search helper preserves existing facet selections when adding another value', function () {
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/ProductMgr': {
                getProduct: function () {
                    return null;
                }
            },
            'dw/system/Site': {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return [];
                        }
                    };
                }
            },
            'dw/web/URLUtils': {
                url: function (routeName) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var pairs = [];
                    var index;

                    for (index = 0; index < args.length; index += 2) {
                        pairs.push(
                            encodeURIComponent(String(args[index])) + '=' +
                            encodeURIComponent(String(args[index + 1]))
                        );
                    }

                    return {
                        toString: function () {
                            return '/' + routeName + (pairs.length ? '?' + pairs.join('&') : '');
                        }
                    };
                }
            },
            '*/cartridge/config/preferences': {
                defaultPageSize: 24
            },
            '*/cartridge/scripts/factories/product': {
                get: function () {
                    return null;
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/CommerceApiService': {
                search: function () {
                    return {
                        products: [],
                        facets: [{
                            id: 'brand',
                            label: 'Brand',
                            type: 'regular',
                            values: [{
                                id: 'Chien',
                                label: 'Chien',
                                count: 12,
                                selected: true
                            }, {
                                id: 'Chat',
                                label: 'Chat',
                                count: 9,
                                selected: false
                            }]
                        }],
                        pagination: {
                            total: 12
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'response-1',
                        queryUid: 'query-1',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        },
                        raw: {
                            facets: [{
                                facetId: 'brand',
                                field: 'ec_animal_type',
                                values: [{
                                    id: 'Chien',
                                    value: 'Chien',
                                    displayValue: 'Chien',
                                    numberOfResults: 12,
                                    state: 'selected'
                                }, {
                                    id: 'Chat',
                                    value: 'Chat',
                                    displayValue: 'Chat',
                                    numberOfResults: 9,
                                    state: 'idle'
                                }]
                            }]
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var result = helper.search({
        querystring: {
            q: 'chien',
            preferences: {
                ec_animal_type: 'Chien'
            }
        },
        currentCustomer: {}
    });
    var values = result.productSearch.refinements[0].values;

    assert.strictEqual(values[0].selected, true);
    assert.strictEqual(values[1].url, '/Search-ShowAjax?q=chien&prefn1=ec_animal_type&prefv1=Chien%7CChat');
});

test('Mondou Coveo search helper resolves raw facet values from Commerce options arrays', function () {
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/ProductMgr': {
                getProduct: function () {
                    return null;
                }
            },
            'dw/system/Site': {
                getCurrent: function () {
                    return {
                        getCustomPreferenceValue: function () {
                            return [];
                        }
                    };
                }
            },
            'dw/web/URLUtils': {
                url: function (routeName) {
                    var args = Array.prototype.slice.call(arguments, 1);
                    var pairs = [];
                    var index;

                    for (index = 0; index < args.length; index += 2) {
                        pairs.push(
                            encodeURIComponent(String(args[index])) + '=' +
                            encodeURIComponent(String(args[index + 1]))
                        );
                    }

                    return {
                        toString: function () {
                            return '/' + routeName + (pairs.length ? '?' + pairs.join('&') : '');
                        }
                    };
                }
            },
            '*/cartridge/config/preferences': {
                defaultPageSize: 24
            },
            '*/cartridge/scripts/factories/product': {
                get: function () {
                    return null;
                }
            },
            'int_coveo_commerce/cartridge/scripts/services/CommerceApiService': {
                search: function () {
                    return {
                        products: [],
                        facets: [{
                            id: 'brand',
                            label: 'Brand',
                            type: 'regular',
                            values: [{
                                id: 'Chien',
                                label: 'Chien',
                                count: 12,
                                selected: false
                            }]
                        }],
                        pagination: {
                            total: 12
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'response-1',
                        queryUid: 'query-1',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-search'
                        },
                        raw: {
                            facets: [{
                                facetId: 'brand',
                                field: 'ec_animal_type',
                                options: [{
                                    name: 'dog',
                                    displayValue: 'Chien',
                                    numberOfResults: 12,
                                    state: 'idle'
                                }]
                            }]
                        }
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var result = helper.search({
        querystring: {
            q: 'chien'
        },
        currentCustomer: {}
    });
    var value = result.productSearch.refinements[0].values[0];

    assert.strictEqual(value.id, 'dog');
    assert.strictEqual(value.url, '/Search-ShowAjax?q=chien&prefn1=ec_animal_type&prefv1=dog');
    assert.strictEqual(value.displayValue, 'Chien');
});

test('CommerceApiService.productSuggest targets the Commerce productSuggest endpoint', function () {
    var capturedRequest = null;
    var expectedResult = {
        products: [{
            id: 'product-1'
        }],
        responseId: 'response-1',
        queryUid: 'query-1',
        analytics: {
            clientId: 'client-1'
        }
    };
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/models/SearchResult': function SearchResult(data) {
                this.data = data;
            },
            '*/cartridge/models/ListingResult': function ListingResult(data) {
                this.data = data;
            },
            '*/cartridge/models/RecommendationResult': function RecommendationResult(data) {
                this.data = data;
            },
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {
                        apiEndpoint: 'https://platform.cloud.coveo.com/rest/organizations/acme/commerce/v2',
                        trackingId: 'mondou_ca',
                        timeoutMillis: 5000,
                        retryCount: 1
                    };
                },
                validateSettings: function () {
                    return [];
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                info: function () {},
                warn: function () {},
                error: function () {}
            },
            '*/cartridge/scripts/helpers/QueryBuilder': {
                buildProductSuggestPayload: function (params, settings, analyticsContext) {
                    assert.strictEqual(params.query, 'chien');
                    assert.strictEqual(settings.trackingId, 'mondou_ca');
                    assert.strictEqual(analyticsContext.clientId, 'client-1');

                    return {
                        trackingId: 'mondou_ca',
                        clientId: 'client-1',
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: 'chien'
                    };
                }
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (baseUrl, endpointPath) {
                    return baseUrl + '/' + endpointPath;
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
                    return expectedResult;
                }
            },
            '*/cartridge/scripts/services/AnalyticsService': {
                buildRequestContext: function () {
                    return {
                        clientId: 'client-1',
                        searchHub: 'mondou_storefront',
                        pipeline: 'mondou-search'
                    };
                }
            },
            '*/cartridge/scripts/services/HttpClient': {
                request: function (options) {
                    capturedRequest = options;
                    return {
                        data: {
                            items: [{
                                productId: 'product-1'
                            }]
                        }
                    };
                }
            }
        }
    );
    var result = CommerceApiService.productSuggest({
        query: 'chien'
    });

    assert.strictEqual(capturedRequest.name, 'productSuggest');
    assert.strictEqual(
        capturedRequest.url,
        'https://platform.cloud.coveo.com/rest/organizations/acme/commerce/v2/search/productSuggest'
    );
    assert.deepStrictEqual(result, expectedResult);
});

test('CommerceApiService.querySuggest normalizes completions payloads', function () {
    var capturedRequest = null;
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/models/SearchResult': function SearchResult(data) {
                this.data = data;
            },
            '*/cartridge/models/ListingResult': function ListingResult(data) {
                this.data = data;
            },
            '*/cartridge/models/RecommendationResult': function RecommendationResult(data) {
                this.data = data;
            },
            '*/cartridge/scripts/config/Config': {
                getSettings: function () {
                    return {
                        apiEndpoint: 'https://platform.cloud.coveo.com/rest/organizations/acme/commerce/v2',
                        trackingId: 'mondou_ca',
                        timeoutMillis: 5000,
                        retryCount: 1
                    };
                },
                validateSettings: function () {
                    return [];
                }
            },
            '*/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                info: function () {},
                warn: function () {},
                error: function () {}
            },
            '*/cartridge/scripts/helpers/QueryBuilder': {
                buildQuerySuggestPayload: function () {
                    return {
                        trackingId: 'mondou_ca',
                        clientId: 'client-1',
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: 'chi'
                    };
                }
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (baseUrl, endpointPath) {
                    return baseUrl + '/' + endpointPath;
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
            '*/cartridge/scripts/services/AnalyticsService': {
                buildRequestContext: function () {
                    return {
                        clientId: 'client-1',
                        searchHub: 'mondou_storefront',
                        pipeline: 'mondou-search'
                    };
                }
            },
            '*/cartridge/scripts/services/HttpClient': {
                request: function (options) {
                    capturedRequest = options;
                    return {
                        data: {
                            completions: [
                                {
                                    expression: '[chi]en'
                                },
                                {
                                    highlighted: '<em>chi</em>ot'
                                },
                                {
                                    value: ' '
                                }
                            ],
                            responseId: 'response-1',
                            queryUid: 'query-1'
                        }
                    };
                }
            }
        }
    );
    var result = CommerceApiService.querySuggest({
        query: 'chi'
    });

    assert.strictEqual(capturedRequest.name, 'querySuggest');
    assert.strictEqual(
        capturedRequest.url,
        'https://platform.cloud.coveo.com/rest/organizations/acme/commerce/v2/search/querySuggest'
    );
    assert.strictEqual(result.suggestions.length, 2);
    assert.strictEqual(result.suggestions[0].value, 'chien');
    assert.strictEqual(result.suggestions[0].raw.expression, '[chi]en');
    assert.strictEqual(result.suggestions[1].value, '<em>chi</em>ot');
    assert.strictEqual(result.suggestions[1].raw.highlighted, '<em>chi</em>ot');
    assert.strictEqual(result.responseId, 'response-1');
    assert.strictEqual(result.queryUid, 'query-1');
});

(function run() {
    var failed = false;

    function write(stream, message) {
        stream.write(message + '\n');
    }

    tests.forEach(function (entry) {
        try {
            entry.fn();
            write(process.stdout, 'PASS ' + entry.name);
        } catch (error) {
            failed = true;
            write(process.stderr, 'FAIL ' + entry.name);
            write(process.stderr, String(error && error.stack ? error.stack : error));
        }
    });

    if (failed) {
        process.exit(1);
    }
}());
