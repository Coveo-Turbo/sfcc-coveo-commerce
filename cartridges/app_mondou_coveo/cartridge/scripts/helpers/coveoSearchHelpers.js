'use strict';

var ProductMgr = require('dw/catalog/ProductMgr');
var Site = require('dw/system/Site');
var URLUtils = require('dw/web/URLUtils');
var preferences = require('*/cartridge/config/preferences');
var ProductFactory = require('*/cartridge/scripts/factories/product');
var CommerceApiService = require('int_coveo_commerce/cartridge/scripts/services/CommerceApiService');
var GtmHelper = require('int_coveo_commerce/cartridge/scripts/helpers/GtmHelper');
var Logger = require('int_coveo_commerce/cartridge/scripts/helpers/Logger');

var DEFAULT_PAGE_SIZE = preferences.defaultPageSize || 24;
var HIDDEN_QUERY_KEYS = {
    page: true,
    selectedUrl: true
};
var HEADER_REFINEMENTS = {
    brand: true,
    recurrence: true
};

function getHttpRequest() {
    if (typeof request !== 'undefined') {
        return request;
    }

    return null;
}

function getHttpResponse() {
    if (typeof response !== 'undefined') {
        return response;
    }

    return null;
}

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function normalizeBoolean(value) {
    if (value === true || value === 'true' || value === '1') {
        return true;
    }

    return false;
}

function safeDecode(value) {
    if (!value && value !== 0) {
        return '';
    }

    try {
        return decodeURIComponent(String(value));
    } catch (error) {
        return String(value);
    }
}

function normalizeCssToken(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeList(value) {
    var result = [];
    var iterator;
    var index;

    if (!value) {
        return result;
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
        return value.map(String);
    }

    if (typeof value === 'string') {
        return value.split(',').map(function (entry) {
            return entry.replace(/^\s+|\s+$/g, '');
        }).filter(function (entry) {
            return entry;
        });
    }

    if (typeof value.length === 'number') {
        for (index = 0; index < value.length; index += 1) {
            result.push(String(value[index]));
        }

        return result;
    }

    if (value.toArray) {
        return value.toArray().map(String);
    }

    if (value.iterator) {
        iterator = value.iterator();

        while (iterator.hasNext()) {
            result.push(String(iterator.next()));
        }

        return result;
    }

    return [String(value)];
}

function pushUniqueValue(target, value) {
    var normalized = value ? String(value) : '';

    if (!normalized || target.indexOf(normalized) >= 0) {
        return;
    }

    target.push(normalized);
}

function getCollectionFirstProductId(collection) {
    var iterator;
    var index;
    var product;
    var values;

    if (!collection) {
        return '';
    }

    if (collection.iterator) {
        iterator = collection.iterator();

        while (iterator.hasNext()) {
            product = iterator.next();

            if (product && product.ID) {
                return String(product.ID);
            }
        }

        return '';
    }

    if (collection.toArray) {
        values = collection.toArray();

        for (index = 0; index < values.length; index += 1) {
            if (values[index] && values[index].ID) {
                return String(values[index].ID);
            }
        }

        return '';
    }

    if (typeof collection.length === 'number') {
        for (index = 0; index < collection.length; index += 1) {
            if (collection[index] && collection[index].ID) {
                return String(collection[index].ID);
            }
        }
    }

    return '';
}

function resolveApiProductId(apiProduct) {
    var variationModel;
    var firstVariantId;

    if (!apiProduct) {
        return '';
    }

    variationModel = apiProduct.variationModel;

    if (variationModel && !apiProduct.variant) {
        if (variationModel.selectedVariant) {
            return String(variationModel.selectedVariant.ID);
        }

        if (variationModel.defaultVariant) {
            return String(variationModel.defaultVariant.ID);
        }

        firstVariantId = getCollectionFirstProductId(
            variationModel.getVariants ? variationModel.getVariants() : variationModel.variants
        );

        if (firstVariantId) {
            return firstVariantId;
        }
    }

    return apiProduct.ID ? String(apiProduct.ID) : '';
}

function getCandidateProductIds(product) {
    var raw = product && product.raw ? product.raw : {};
    var candidates = [];

    pushUniqueValue(candidates, product && product.id);
    pushUniqueValue(candidates, raw.ec_product_id);
    pushUniqueValue(candidates, raw.ec_productid);
    pushUniqueValue(candidates, raw.productId);
    pushUniqueValue(candidates, raw.product_id);
    pushUniqueValue(candidates, product && product.sku);
    pushUniqueValue(candidates, raw.sku);
    pushUniqueValue(candidates, raw.productSku);
    pushUniqueValue(candidates, raw.ec_parent);
    pushUniqueValue(candidates, raw.parentProductId);
    pushUniqueValue(candidates, raw.parent_product_id);
    pushUniqueValue(candidates, raw.ec_parent_product_id);
    pushUniqueValue(candidates, raw.ec_parent_productid);
    pushUniqueValue(candidates, raw.masterProductId);
    pushUniqueValue(candidates, raw.master_product_id);

    return candidates;
}

function isRenderableTileProductId(productId, renderableProductCache) {
    var cachedValue;
    var tileProduct;

    if (!productId) {
        return false;
    }

    if (renderableProductCache && Object.prototype.hasOwnProperty.call(renderableProductCache, productId)) {
        return renderableProductCache[productId];
    }

    try {
        tileProduct = ProductFactory.get({
            pid: productId,
            pview: 'tile'
        });
    } catch (error) {
        tileProduct = null;
    }

    cachedValue = !!(tileProduct && tileProduct.id);

    if (renderableProductCache) {
        renderableProductCache[productId] = cachedValue;
    }

    return cachedValue;
}

function resolveRenderableProductId(product, renderableProductCache) {
    var candidates = getCandidateProductIds(product);
    var candidateId;
    var apiProduct;
    var resolvedId;
    var index;

    for (index = 0; index < candidates.length; index += 1) {
        candidateId = candidates[index];
        apiProduct = ProductMgr.getProduct(candidateId);

        if (apiProduct) {
            resolvedId = resolveApiProductId(apiProduct);

            if (resolvedId && isRenderableTileProductId(resolvedId, renderableProductCache)) {
                return resolvedId;
            }
        }
    }

    return '';
}

function cloneQuery(querystring) {
    var source = querystring || {};
    var target = {};

    Object.keys(source).forEach(function (key) {
        if (typeof source[key] !== 'undefined' && source[key] !== null && source[key] !== '') {
            target[key] = String(source[key]);
        }
    });

    return target;
}

function isCoveoSearchRequest(querystring) {
    return !!(querystring && querystring.q && !querystring.cgid);
}

function isCoveoDebugRequest(querystring) {
    return !!(querystring && normalizeBoolean(querystring.coveoDebug));
}

function getPageSize(querystring) {
    return normalizeNumber(querystring && querystring.sz, DEFAULT_PAGE_SIZE);
}

function getStartIndex(querystring) {
    return normalizeNumber(querystring && querystring.start, 0);
}

function getPageNumber(querystring) {
    var pageSize = getPageSize(querystring);
    var startIndex = getStartIndex(querystring);

    if (pageSize <= 0) {
        return 1;
    }

    return Math.floor(startIndex / pageSize) + 1;
}

function getPageIndex(querystring) {
    var pageSize = getPageSize(querystring);
    var startIndex = getStartIndex(querystring);

    if (pageSize <= 0) {
        return 0;
    }

    return Math.floor(startIndex / pageSize);
}

function getVisibleCount(querystring, currentCount) {
    return getStartIndex(querystring) + currentCount;
}

function getListPreference(preferenceName) {
    return normalizeList(Site.getCurrent().getCustomPreferenceValue(preferenceName));
}

function splitFacetValues(rawValues) {
    return String(rawValues || '').split('|').map(function (value) {
        return safeDecode(value).replace(/^\s+|\s+$/g, '');
    }).filter(function (value) {
        return value;
    });
}

function parseFacetSelections(querystring) {
    var query = querystring || {};
    var filters = {};

    Object.keys(query).forEach(function (key) {
        var match = key.match(/^prefn(\d+)$/);
        var valueKey;
        var attributeId;
        var rawValues;

        if (!match) {
            return;
        }

        valueKey = 'prefv' + match[1];
        attributeId = safeDecode(query[key]);
        rawValues = query[valueKey];

        if (!attributeId || !rawValues) {
            return;
        }

        filters[attributeId] = splitFacetValues(rawValues);
    });

    return filters;
}

function buildServiceFilters(querystring) {
    var filters = parseFacetSelections(querystring);

    if (querystring && (querystring.pmin || querystring.pmax)) {
        filters.price = {};

        if (querystring.pmin) {
            filters.price.min = normalizeNumber(querystring.pmin, querystring.pmin);
        }

        if (querystring.pmax) {
            filters.price.max = normalizeNumber(querystring.pmax, querystring.pmax);
        }
    }

    return filters;
}

function removeFacetParams(querystring) {
    Object.keys(querystring).forEach(function (key) {
        if (/^pref[fnv]\d+$/.test(key)) {
            delete querystring[key];
        }
    });
}

function buildRouteUrl(routeName, querystring) {
    var params = querystring || {};
    var args = [routeName];

    Object.keys(params).forEach(function (key) {
        if (typeof params[key] === 'undefined' || params[key] === null || params[key] === '') {
            return;
        }

        args.push(key);
        args.push(String(params[key]));
    });

    return URLUtils.url.apply(URLUtils, args).toString();
}

function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(String(value));
    } catch (error) {
        return fallback;
    }
}

function buildBaseQuery(querystring) {
    var query = cloneQuery(querystring);

    Object.keys(HIDDEN_QUERY_KEYS).forEach(function (key) {
        delete query[key];
    });

    return query;
}

function buildQueryWithSelections(querystring, facetSelections, options) {
    var query = buildBaseQuery(querystring);
    var selections = facetSelections || {};
    var config = options || {};
    var index = 1;

    removeFacetParams(query);
    delete query.pmin;
    delete query.pmax;
    delete query.start;

    if (config.resetSort) {
        delete query.srule;
    }

    if (config.sortRule) {
        query.srule = config.sortRule;
    }

    if (config.pageSize) {
        query.sz = config.pageSize;
    } else {
        delete query.sz;
    }

    Object.keys(selections).forEach(function (attributeId) {
        var values = selections[attributeId];

        if (!values || !values.length) {
            return;
        }

        query['prefn' + index] = attributeId;
        query['prefv' + index] = values.join('|');
        index += 1;
    });

    return query;
}

function buildFacetToggleUrl(querystring, attributeId, valueId, visibleCount) {
    var selections = parseFacetSelections(querystring);
    var currentValues = selections[attributeId] || [];
    var nextValues = [];
    var isSelected = false;

    currentValues.forEach(function (entry) {
        if (entry === valueId) {
            isSelected = true;
            return;
        }

        nextValues.push(entry);
    });

    if (!isSelected) {
        nextValues.push(valueId);
    }

    if (nextValues.length) {
        selections[attributeId] = nextValues;
    } else {
        delete selections[attributeId];
    }

    return buildRouteUrl('Search-ShowAjax', buildQueryWithSelections(querystring, selections, {
        pageSize: visibleCount
    }));
}

function buildResetLink(querystring) {
    var query = buildBaseQuery(querystring);

    removeFacetParams(query);
    delete query.pmin;
    delete query.pmax;
    delete query.start;
    delete query.sz;
    delete query.srule;

    return buildRouteUrl('Search-ShowAjax', query);
}

function buildPermalink(querystring, visibleCount) {
    return buildRouteUrl('Search-Show', buildQueryWithSelections(querystring, parseFacetSelections(querystring), {
        pageSize: visibleCount,
        sortRule: querystring && querystring.srule ? querystring.srule : null
    }));
}

function buildShowMoreUrl(querystring, totalCount) {
    var currentStart = getStartIndex(querystring);
    var pageSize = getPageSize(querystring);
    var nextStart = currentStart + pageSize;
    var query;

    if (nextStart >= totalCount) {
        return '';
    }

    query = buildQueryWithSelections(querystring, parseFacetSelections(querystring), {
        pageSize: pageSize,
        sortRule: querystring && querystring.srule ? querystring.srule : null
    });
    query.start = nextStart;

    return buildRouteUrl('Search-UpdateGrid', query);
}

function buildRefineUrl(querystring) {
    return buildRouteUrl('Search-Refinebar', buildBaseQuery(querystring));
}

function isPriceFacet(facet) {
    var facetId = String((facet && facet.id) || '').toLowerCase();
    var facetType = String((facet && facet.type) || '').toLowerCase();

    return facetType === 'price' || /price|prix/.test(facetId);
}

function getValueType(attributeId) {
    var normalized = String(attributeId || '').toLowerCase();

    if (/color|colour|couleur/.test(normalized)) {
        return 'color';
    }

    if (/size|taille|format/.test(normalized)) {
        return 'size';
    }

    return 'boolean';
}

function resolveValueMetadata(mappedValue, rawValue, attributeId) {
    var displayValue = mappedValue && (mappedValue.label || mappedValue.id) ? (mappedValue.label || mappedValue.id) : '';
    var normalizedToken = normalizeCssToken(displayValue || (mappedValue && mappedValue.id) || '');

    if (!displayValue && rawValue && typeof rawValue.start !== 'undefined' && typeof rawValue.end !== 'undefined') {
        displayValue = rawValue.start + ' - ' + rawValue.end;
    }

    return {
        displayValue: displayValue,
        type: getValueType(attributeId),
        swatchId: (rawValue && (rawValue.swatchId || rawValue.presentationId)) || normalizedToken,
        presentationId: (rawValue && rawValue.presentationId) || normalizedToken
    };
}

function mapRefinementValues(refinement, rawRefinement, querystring, visibleCount) {
    return (refinement.values || []).map(function (value, index) {
        var rawValue = rawRefinement && rawRefinement.values && rawRefinement.values[index] ? rawRefinement.values[index] : {};
        var valueId = String(value.id || value.label || '');
        var metadata = resolveValueMetadata(value, rawValue, refinement.id);

        if (refinement.type === 'numericalRange' && typeof rawValue.start !== 'undefined' && typeof rawValue.end !== 'undefined') {
            valueId = ['range', rawValue.start, rawValue.end, rawValue.endInclusive === false ? '0' : '1'].join(':');
        }

        return {
            id: valueId,
            url: buildFacetToggleUrl(querystring, refinement.id, valueId, visibleCount),
            selected: value.selected === true,
            selectable: value.count > 0 || value.selected === true,
            displayValue: metadata.displayValue,
            title: metadata.displayValue,
            type: metadata.type,
            count: value.count || 0,
            swatchId: metadata.swatchId,
            presentationId: metadata.presentationId
        };
    });
}

function mapRefinements(searchResult, querystring, visibleCount) {
    var openRefinements = getListPreference('openRefinements');
    var hiddenRefinements = getListPreference('notVisibleRefinements');
    var rawFacets = (searchResult.raw && (searchResult.raw.facets || searchResult.raw.filters)) || [];

    return (searchResult.facets || []).map(function (refinement, index) {
        var rawRefinement = rawFacets[index] || {};
        var values = mapRefinementValues(refinement, rawRefinement, querystring, visibleCount);
        var priceRefinement = isPriceFacet(refinement);

        return {
            attributeID: refinement.id,
            displayName: refinement.label,
            isCategoryRefinement: false,
            isAttributeRefinement: !priceRefinement,
            isPriceRefinement: priceRefinement,
            isPromotionRefinement: false,
            values: values,
            showOpen: openRefinements.indexOf(refinement.id) >= 0,
            display: hiddenRefinements.indexOf(refinement.id) < 0,
            cutoffThreshold: rawRefinement.cutoffThreshold || values.length
        };
    });
}

function mapSelectedFilters(refinements) {
    var selectedFilters = [];

    refinements.forEach(function (refinement) {
        refinement.values.forEach(function (value) {
            if (!value.selected) {
                return;
            }

            selectedFilters.push({
                id: refinement.attributeID,
                type: value.type,
                url: value.url,
                title: value.title,
                displayValue: value.displayValue,
                presentationId: value.presentationId
            });
        });
    });

    return selectedFilters;
}

function buildProductIds(searchResult) {
    var renderableProductCache = {};
    var unresolvedProducts = [];
    var mappedProducts = (searchResult.products || []).map(function (product) {
        var productId = resolveRenderableProductId(product, renderableProductCache);

        if (!productId) {
            unresolvedProducts.push(getCandidateProductIds(product).join('|') || '(missing)');
        }

        return {
            productID: productId,
            coveoProduct: product
        };
    }).filter(function (product) {
        return !!product.productID;
    });

    if (unresolvedProducts.length) {
        Logger.warn('Dropped Coveo hits that could not be resolved to an SFCC product ID.', {
            count: unresolvedProducts.length,
            sample: unresolvedProducts.slice(0, 5).join(', ')
        });
    }

    return mappedProducts;
}

function buildSortOptions(searchResult, querystring, visibleCount) {
    var sorting = searchResult.sorting || {};
    var selectedRule = querystring.srule || sorting.selected || '';

    return {
        ruleId: selectedRule,
        options: (sorting.options || []).map(function (option) {
            var query = buildQueryWithSelections(querystring, parseFacetSelections(querystring), {
                pageSize: visibleCount,
                sortRule: option.id
            });

            query.coveosort = JSON.stringify(option.raw || {});

            return {
                displayName: option.label,
                id: option.id,
                url: buildRouteUrl('Search-UpdateGrid', query)
            };
        })
    };
}

function buildProductSearch(searchResult, querystring) {
    var products = buildProductIds(searchResult);
    var returnedCount = (searchResult.products || []).length;
    var totalCount = searchResult.pagination && searchResult.pagination.total ? searchResult.pagination.total : returnedCount;
    var visibleCount = getVisibleCount(querystring, returnedCount);
    var refinements = mapRefinements(searchResult, querystring, visibleCount);

    return {
        pageSize: getPageSize(querystring),
        pageNumber: getPageNumber(querystring),
        count: totalCount,
        isCategorySearch: false,
        isRefinedCategorySearch: false,
        searchKeywords: querystring.q || '',
        resetLink: buildResetLink(querystring),
        productIds: products,
        productSort: buildSortOptions(searchResult, querystring, visibleCount),
        showMoreUrl: buildShowMoreUrl(querystring, totalCount),
        permalink: buildPermalink(querystring, visibleCount),
        category: null,
        pageMetaTags: [],
        isSearchSuggestionsAvailable: false,
        suggestionPhrases: [],
        refinements: refinements,
        selectedFilters: mapSelectedFilters(refinements),
        responseId: searchResult.responseId,
        queryUid: searchResult.queryUid
    };
}

function buildSearchParams(req) {
    var query = cloneQuery(req.querystring);
    var params = cloneQuery(req.querystring);

    params.query = query.q || '';
    params.page = getPageIndex(query);
    params.perPage = getPageSize(query);
    params.sort = parseJson(query.coveosort, query.sort || '');
    params.sortId = query.srule || '';
    params.filters = buildServiceFilters(query);
    params.currentCustomer = req.currentCustomer;
    params.coveoDebug = isCoveoDebugRequest(query);
    params.request = getHttpRequest();
    params.response = getHttpResponse();

    return params;
}

function search(req) {
    var params = buildSearchParams(req);
    var searchResult = CommerceApiService.search(params);
    var productSearch = buildProductSearch(searchResult, cloneQuery(req.querystring));

    Logger.debug('Mapped Mondou Coveo search response.', {
        query: params.query,
        responseId: searchResult.responseId
    });

    return {
        productSearch: productSearch,
        refineurl: buildRefineUrl(req.querystring),
        coveoSearch: searchResult,
        coveoAnalytics: searchResult.analytics,
        coveoDataLayer: GtmHelper.buildSearchResponseEvent(searchResult, {
            query: params.query,
            searchHub: searchResult.analytics.searchHub,
            pipeline: searchResult.analytics.pipeline
        }),
        headerRefinements: productSearch.refinements.filter(function (refinement) {
            return HEADER_REFINEMENTS[refinement.attributeID] === true;
        })
    };
}

module.exports = {
    isCoveoSearchRequest: isCoveoSearchRequest,
    search: search
};
