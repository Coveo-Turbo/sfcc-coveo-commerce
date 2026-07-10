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

test('QueryBuilder builds listing payload with categoryId from request context', function () {
    var QueryBuilder = require(path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/helpers/QueryBuilder.js'));
    var payload = QueryBuilder.buildListingPayload({
        cgid: 'chien',
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
        trackingId: 'mondou_ca',
        language: 'en',
        country: 'US',
        currency: 'USD'
    }, {
        clientId: 'client-1'
    });

    assert.strictEqual(payload.categoryId, 'chien');
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

test('Mondou Coveo search helper maps category requests through listing()', function () {
    var capturedParams = null;
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/CatalogMgr': {
                getCategory: function (categoryId) {
                    return {
                        ID: categoryId,
                        displayName: 'Chiens',
                        pageTitle: 'Chiens',
                        description: 'Produits pour chiens',
                        pageDescription: 'Page chiens',
                        pageKeywords: 'chiens',
                        custom: {}
                    };
                }
            },
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
                    throw new Error('search() should not be used for category requests');
                },
                listing: function (params) {
                    capturedParams = params;

                    return {
                        products: [],
                        facets: [],
                        pagination: {
                            total: 0
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'listing-response-1',
                        queryUid: 'listing-query-1',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-listing'
                        },
                        raw: {}
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function (result, context) {
                    return {
                        event: 'coveoListingResponse',
                        responseId: result.responseId,
                        categoryId: context.categoryId
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var result = helper.execute({
        querystring: {
            cgid: 'chien'
        },
        currentCustomer: {}
    });

    assert.ok(capturedParams);
    assert.strictEqual(capturedParams.categoryId, 'chien');
    assert.strictEqual(capturedParams.currentUrl, '/Search-Show?cgid=chien');
    assert.strictEqual(result.productSearch.isCategorySearch, true);
    assert.strictEqual(result.productSearch.category.id, 'chien');
    assert.strictEqual(result.productSearch.category.name, 'Chiens');
    assert.strictEqual(result.coveoDataLayer.event, 'coveoListingResponse');
    assert.strictEqual(result.coveoDataLayer.categoryId, 'chien');
});

test('Mondou Coveo search helper detects category requests from httpParameterMap SEO urls', function () {
    var capturedParams = null;
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/CatalogMgr': {
                getCategory: function (categoryId) {
                    return {
                        ID: categoryId,
                        displayName: 'Chats',
                        pageTitle: 'Chats',
                        description: '',
                        pageDescription: '',
                        pageKeywords: '',
                        custom: {}
                    };
                }
            },
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
                    throw new Error('search() should not be used for SEO category requests');
                },
                listing: function (params) {
                    capturedParams = params;

                    return {
                        products: [],
                        facets: [],
                        pagination: {
                            total: 0
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'listing-response-seo',
                        queryUid: 'listing-query-seo',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-listing'
                        },
                        raw: {}
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var req = {
        querystring: {},
        httpParameterMap: {
            cgid: {
                stringValue: 'chat-sec'
            }
        },
        currentCustomer: {}
    };
    var query = helper.buildRequestQuery(req);
    var result = helper.execute(req);

    assert.strictEqual(query.cgid, 'chat-sec');
    assert.strictEqual(helper.isCoveoSearchRequest(req), true);
    assert.ok(capturedParams);
    assert.strictEqual(capturedParams.categoryId, 'chat-sec');
    assert.strictEqual(capturedParams.currentUrl, '/Search-Show?cgid=chat-sec');
    assert.strictEqual(result.productSearch.category.id, 'chat-sec');
    assert.strictEqual(result.productSearch.isCategorySearch, true);
});

test('Mondou Coveo search helper detects category requests from Mondou SEO params payload', function () {
    var capturedParams = null;
    var helper = loadModule(
        path.join(repoRoot, 'cartridges/app_mondou_coveo/cartridge/scripts/helpers/coveoSearchHelpers.js'),
        {
            'dw/catalog/CatalogMgr': {
                getCategory: function (categoryId) {
                    return {
                        ID: categoryId,
                        displayName: 'Nourriture seche',
                        pageTitle: '',
                        description: '',
                        pageDescription: '',
                        pageKeywords: '',
                        custom: {}
                    };
                }
            },
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
                    throw new Error('search() should not be used for Mondou SEO category requests');
                },
                listing: function (params) {
                    capturedParams = params;

                    return {
                        products: [],
                        facets: [],
                        pagination: {
                            total: 0
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'listing-response-seo-params',
                        queryUid: 'listing-query-seo-params',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-listing'
                        },
                        raw: {}
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var req = {
        querystring: {},
        httpParameterMap: {
            params: {
                value: JSON.stringify({
                    custom: JSON.stringify({
                        queryString: 'cgid=cat-dry-food&prefn1=brand&prefv1=Acme'
                    })
                })
            }
        },
        currentCustomer: {}
    };
    var query = helper.buildRequestQuery(req);
    var result = helper.execute(req);

    assert.strictEqual(query.cgid, 'cat-dry-food');
    assert.strictEqual(query.prefn1, 'brand');
    assert.strictEqual(query.prefv1, 'Acme');
    assert.strictEqual(helper.isCoveoSearchRequest(req), true);
    assert.ok(capturedParams);
    assert.strictEqual(capturedParams.categoryId, 'cat-dry-food');
    assert.strictEqual(capturedParams.currentUrl, '/Search-Show?cgid=cat-dry-food');
    assert.strictEqual(result.productSearch.isCategorySearch, true);
    assert.strictEqual(result.productSearch.category.id, 'cat-dry-food');
});

test('Mondou Coveo search helper strips SFCC site prefix from listing view urls', function () {
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
                url: function () {
                    return {
                        toString: function () {
                            return '/s/Mondou_CA/fr-CA/chat/nourriture-et-gateries/nourriture-seche/';
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
                    return {};
                },
                listing: function (params) {
                    return {
                        products: [],
                        facets: [],
                        pagination: {
                            total: 0
                        },
                        sorting: {
                            options: [],
                            selected: ''
                        },
                        responseId: 'listing-response-url',
                        queryUid: 'listing-query-url',
                        analytics: {
                            searchHub: 'mondou_storefront',
                            pipeline: 'mondou-listing'
                        },
                        raw: {}
                    };
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            },
            'dw/catalog/CatalogMgr': {
                getCategory: function (categoryId) {
                    return {
                        ID: categoryId,
                        displayName: 'Chats',
                        custom: {}
                    };
                }
            }
        }
    );
    var req = {
        querystring: {
            cgid: 'chat-nourriture-nourriture-seche'
        },
        currentCustomer: {}
    };
    var params = helper.execute(req);

    assert.strictEqual(
        helper.normalizeListingViewUrl('/s/Mondou_CA/fr-CA/chat/nourriture-et-gateries/nourriture-seche/'),
        '/fr-CA/chat/nourriture-et-gateries/nourriture-seche'
    );
    assert.strictEqual(params.productSearch.category.id, 'chat-nourriture-nourriture-seche');
});

test('Mondou Coveo search helper supports explicit native and coveo flow toggles', function () {
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
                url: function () {
                    return {
                        toString: function () {
                            return '/Search-Show?q=chien';
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
                    return {};
                },
                listing: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );

    assert.strictEqual(helper.isCoveoSearchRequest({ querystring: { q: 'chien', coveoFlow: 'native' } }), false);
    assert.strictEqual(helper.isCoveoSearchRequest({ querystring: { q: 'chien', coveoFlow: 'coveo' } }), true);
    assert.strictEqual(helper.getRequestedFlow({ coveoFlow: 'native' }), 'native');
    assert.strictEqual(helper.getRequestedFlow({ coveoFlow: 'coveo' }), 'coveo');
});

test('Mondou Coveo search helper persists explicit flow override across follow-up requests', function () {
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
                url: function () {
                    return {
                        toString: function () {
                            return '/Search-Show?q=chien';
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
                    return {};
                },
                listing: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/GtmHelper': {
                buildSearchResponseEvent: function () {
                    return {};
                },
                buildListingResponseEvent: function () {
                    return {};
                }
            },
            'int_coveo_commerce/cartridge/scripts/helpers/Logger': {
                debug: function () {},
                warn: function () {}
            }
        }
    );
    var session = {
        privacy: {}
    };
    var initialRequest = {
        querystring: {
            q: 'chien',
            coveoFlow: 'native'
        },
        session: session
    };
    var followUpRequest = {
        querystring: {
            q: 'chien',
            prefn1: 'brand',
            prefv1: 'Acana'
        },
        session: session
    };

    assert.strictEqual(helper.buildRequestQuery(initialRequest).coveoFlow, 'native');
    assert.strictEqual(session.privacy.coveoFlowOverride, 'native');
    assert.strictEqual(helper.buildRequestQuery(followUpRequest).coveoFlow, 'native');
    assert.strictEqual(helper.isCoveoSearchRequest(followUpRequest), false);
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

test('Mondou Coveo search helper preserves native brand refinement id for special header rendering', function () {
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
                            id: 'ec_brand',
                            label: 'Brand',
                            type: 'regular',
                            values: [{
                                id: 'acana',
                                label: 'Acana',
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
                                field: 'ec_brand',
                                values: [{
                                    id: 'acana',
                                    value: 'acana',
                                    displayValue: 'Acana',
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

    assert.strictEqual(result.productSearch.refinements[0].attributeID, 'brand');
    assert.strictEqual(result.headerRefinements.length, 1);
    assert.strictEqual(result.headerRefinements[0].attributeID, 'brand');
    assert.strictEqual(result.headerRefinements[0].values[0].url, '/Search-ShowAjax?q=chien&prefn1=ec_brand&prefv1=acana');
});

test('Mondou Coveo search helper aliases autoship refinements to recurrence for native toggle rendering', function () {
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
                            id: 'ec_subscription_eligible',
                            label: 'Récurrent',
                            type: 'regular',
                            values: [{
                                id: 'true',
                                label: 'Oui',
                                count: 8,
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
                                facetId: 'ec_subscription_eligible',
                                field: 'ec_subscription_eligible',
                                values: [{
                                    id: 'true',
                                    value: 'true',
                                    displayValue: 'Oui',
                                    presentationId: 'true',
                                    numberOfResults: 8,
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
            q: 'chien'
        },
        currentCustomer: {}
    });

    assert.strictEqual(result.productSearch.refinements[0].attributeID, 'recurrence');
    assert.strictEqual(result.headerRefinements.length, 1);
    assert.strictEqual(result.headerRefinements[0].attributeID, 'recurrence');
    assert.strictEqual(result.headerRefinements[0].values[0].presentationId, 'true');
    assert.strictEqual(result.headerRefinements[0].values[0].url, '/Search-ShowAjax?q=chien&prefn1=ec_subscription_eligible&prefv1=true');
});

test('Mondou Coveo search helper exposes sanitized debug data only when requested', function () {
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
                                id: 'acana',
                                label: 'Acana',
                                count: 5,
                                selected: true
                            }]
                        }],
                        pagination: {
                            total: 5
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
                                field: 'ec_brand',
                                values: [{
                                    value: 'acana',
                                    displayValue: 'Acana',
                                    state: 'selected'
                                }]
                            }]
                        },
                        debug: {
                            operation: 'search',
                            rawRequest: {
                                query: 'chien'
                            },
                            request: {
                                query: 'chien'
                            },
                            response: {
                                responseId: 'response-1'
                            },
                            rawResponse: {
                                responseId: 'response-1'
                            }
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
            coveoDebug: '1'
        },
        currentCustomer: {}
    });

    assert.ok(result.coveoDebugData);
    assert.strictEqual(result.coveoDebugData.requestType, 'search');
    assert.strictEqual(result.coveoDebugData.commerce.request.query, 'chien');
    assert.strictEqual(result.coveoDebugData.commerce.rawResponse.responseId, 'response-1');
    assert.strictEqual(result.coveoDebugData.storefront.headerRefinementIds[0], 'brand');
    assert.strictEqual(result.coveoDebugData.storefront.refinements[0].selectedValues[0], 'Acana');
});

test('Mondou Coveo search helper maps ec_category as category refinement', function () {
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
                            id: 'ec_category',
                            label: 'Catégories',
                            type: 'hierarchical',
                            values: [{
                                id: 'dry-food',
                                label: 'Nourriture sèche',
                                count: 7,
                                selected: false
                            }]
                        }],
                        pagination: {
                            total: 7
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
                                facetId: 'ec_category',
                                field: 'ec_category',
                                type: 'hierarchical',
                                values: [{
                                    value: 'dry-food',
                                    displayValue: 'Nourriture sèche',
                                    path: ['Chat', 'Nourriture et gâteries', 'Nourriture sèche'],
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
    var categoryRefinement = result.productSearch.refinements[0];

    assert.strictEqual(categoryRefinement.attributeID, 'ec_category');
    assert.strictEqual(categoryRefinement.isCategoryRefinement, true);
    assert.strictEqual(categoryRefinement.isAttributeRefinement, false);
    assert.strictEqual(categoryRefinement.values[0].displayValue, 'Chat');
    assert.strictEqual(categoryRefinement.values[0].subCategories[0].displayValue, 'Nourriture et gâteries');
    assert.strictEqual(categoryRefinement.values[0].subCategories[0].subCategories[0].displayValue, 'Nourriture sèche');
    assert.strictEqual(
        categoryRefinement.values[0].subCategories[0].subCategories[0].url,
        '/Search-ShowAjax?q=chien&prefn1=ec_category&prefv1=Chat%7CNourriture%20et%20g%C3%A2teries%7CNourriture%20s%C3%A8che'
    );
});

test('CommerceApiService.search attaches sanitized debug snapshot when coveoDebug is enabled', function () {
    var CommerceApiService = loadModule(
        path.join(repoRoot, 'cartridges/int_coveo_commerce/cartridge/scripts/services/CommerceApiService.js'),
        {
            '*/cartridge/models/SearchResult': function SearchResult(data) {
                this.data = data;
                return data;
            },
            '*/cartridge/models/ListingResult': function ListingResult(data) {
                return data;
            },
            '*/cartridge/models/RecommendationResult': function RecommendationResult(data) {
                return data;
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
                buildSearchPayload: function () {
                    return {
                        trackingId: 'mondou_ca',
                        clientId: 'client-1',
                        language: 'fr',
                        country: 'CA',
                        currency: 'CAD',
                        query: 'chien',
                        page: 0,
                        perPage: 24,
                        facets: [{
                            facetId: 'brand',
                            field: 'ec_brand',
                            type: 'regular',
                            values: ['acana']
                        }],
                        context: {
                            view: {
                                url: '/fr-CA/search?q=chien'
                            },
                            capture: true,
                            cart: [],
                            user: {
                                userAgent: 'Mozilla/5.0'
                            }
                        }
                    };
                }
            },
            '*/cartridge/scripts/helpers/UrlHelper': {
                buildEndpoint: function (baseUrl, endpointPath) {
                    return baseUrl + '/' + endpointPath;
                }
            },
            '*/cartridge/scripts/mappers/SearchResultMapper': {
                map: function (raw) {
                    return {
                        products: [{ id: 'sku-1' }],
                        facets: [],
                        pagination: {
                            total: 1
                        },
                        sorting: {},
                        breadcrumbs: [],
                        responseId: raw.responseId,
                        queryUid: raw.queryUid,
                        analytics: {
                            clientId: 'client-1'
                        },
                        raw: raw
                    };
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
                request: function () {
                    return {
                        statusCode: 200,
                        duration: 42,
                        data: {
                            responseId: 'response-1',
                            queryUid: 'query-1',
                            pagination: {
                                totalEntries: 1
                            },
                            facets: [{
                                facetId: 'brand',
                                field: 'ec_brand',
                                label: 'Brand',
                                values: [{
                                    displayValue: 'Acana',
                                    state: 'selected'
                                }]
                            }]
                        }
                    };
                }
            }
        }
    );
    var result = CommerceApiService.search({
        query: 'chien',
        coveoDebug: true
    });

    assert.ok(result.debug);
    assert.strictEqual(result.debug.operation, 'search');
    assert.strictEqual(result.debug.request.query, 'chien');
    assert.strictEqual(result.debug.rawRequest.query, 'chien');
    assert.strictEqual(result.debug.request.facets[0].field, 'ec_brand');
    assert.strictEqual(result.debug.response.statusCode, 200);
    assert.strictEqual(result.debug.response.responseId, 'response-1');
    assert.strictEqual(result.debug.response.facets[0].selectedValues[0], 'Acana');
    assert.strictEqual(result.debug.rawResponse.responseId, 'response-1');
    assert.strictEqual(result.debug.rawResponse.facets[0].field, 'ec_brand');
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
