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
