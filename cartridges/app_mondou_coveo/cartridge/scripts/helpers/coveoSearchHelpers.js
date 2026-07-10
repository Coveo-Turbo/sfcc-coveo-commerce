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
var STOREFRONT_REFINEMENT_ALIASES = {
    brand: 'brand',
    ec_brand: 'brand',
    recurrence: 'recurrence',
    ec_subscription_eligible: 'recurrence'
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

function normalizeQueryValue(value) {
    var normalizedEntries;

    if (value === null || typeof value === 'undefined' || value === '') {
        return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
        normalizedEntries = value.map(normalizeQueryValue).filter(function (entry) {
            return entry !== '';
        });

        return normalizedEntries.length ? normalizedEntries.join(',') : '';
    }

    return '';
}

function getHttpParameterValue(httpParameterMap, key) {
    var param = httpParameterMap && httpParameterMap[key];

    if (!param) {
        return '';
    }

    if (typeof param.stringValue !== 'undefined' && param.stringValue !== null && param.stringValue !== '') {
        return String(param.stringValue);
    }

    if (typeof param.value !== 'undefined' && param.value !== null && param.value !== '') {
        return String(param.value);
    }

    return '';
}

function getSessionFlowOverride(req) {
    var privacy = req && req.session ? req.session.privacyCache || req.session.privacy : null;
    var flow = privacy && privacy.coveoFlowOverride ? String(privacy.coveoFlowOverride).toLowerCase() : '';

    if (flow === 'native' || flow === 'coveo') {
        return flow;
    }

    return '';
}

function setSessionFlowOverride(req, flow) {
    var normalized = String(flow || '').toLowerCase();
    var privacy;

    if (normalized !== 'native' && normalized !== 'coveo') {
        return;
    }

    if (!req || !req.session) {
        return;
    }

    privacy = req.session.privacyCache || req.session.privacy;

    if (privacy) {
        privacy.coveoFlowOverride = normalized;
    }
}

function getFlowFromReferer(req) {
    var referer = req && req.httpReferer ? String(req.httpReferer) : '';
    var match;

    if (!referer) {
        return '';
    }

    match = referer.match(/[?&]coveoFlow=([^&#]+)/i);

    if (!match || !match[1]) {
        return '';
    }

    match = safeDecode(match[1]).toLowerCase();

    if (match === 'native' || match === 'coveo') {
        return match;
    }

    return '';
}

function isRequestDebugEnabled(req) {
    var source = req && req.querystring ? req.querystring : {};
    var directValue = source && source.coveoDebug;
    var httpValue = getHttpParameterValue(req && req.httpParameterMap ? req.httpParameterMap : null, 'coveoDebug');

    return normalizeBoolean(directValue) || normalizeBoolean(httpValue);
}

function parseSeoParams(httpParameterMap) {
    var rawParams = getHttpParameterValue(httpParameterMap, 'params');
    var parsedOuter;
    var customPayload;
    var parsedInner;
    var result = {};
    var queryString;

    if (!rawParams) {
        return result;
    }

    try {
        parsedOuter = JSON.parse(rawParams);
        customPayload = parsedOuter && parsedOuter.custom ? parsedOuter.custom : '';
        parsedInner = customPayload ? JSON.parse(customPayload) : {};
        queryString = parsedInner && parsedInner.queryString ? String(parsedInner.queryString) : '';
    } catch (error) {
        return result;
    }

    if (!queryString) {
        return result;
    }

    queryString.split('&').forEach(function (pair) {
        var parts;
        var key;
        var value;

        if (!pair) {
            return;
        }

        parts = pair.split('=');
        key = safeDecode(parts[0] || '');
        value = safeDecode(parts.slice(1).join('=') || '');

        if (!key) {
            return;
        }

        result[key] = value;
    });

    return result;
}

function buildRequestQuery(req) {
    var source = req && req.querystring ? req.querystring : {};
    var query = {};
    var httpParameterMap = req && req.httpParameterMap ? req.httpParameterMap : null;
    var seoParams = parseSeoParams(httpParameterMap);
    var cgid = getHttpParameterValue(httpParameterMap, 'cgid');
    var queryValue = getHttpParameterValue(httpParameterMap, 'q');
    var explicitFlow;
    var inheritedFlow;

    Object.keys(source).forEach(function (key) {
        query[key] = source[key];
    });

    Object.keys(seoParams).forEach(function (key) {
        if (typeof query[key] === 'undefined' || query[key] === null || query[key] === '') {
            query[key] = seoParams[key];
        }
    });

    if (cgid && !query.cgid) {
        query.cgid = cgid;
    }

    if (queryValue && !query.q) {
        query.q = queryValue;
    }

    explicitFlow = String(query && query.coveoFlow ? query.coveoFlow : '').toLowerCase();

    if (explicitFlow !== 'native' && explicitFlow !== 'coveo') {
        explicitFlow = '';
    }

    if (explicitFlow) {
        setSessionFlowOverride(req, explicitFlow);
        return query;
    }

    inheritedFlow = getSessionFlowOverride(req) || getFlowFromReferer(req);

    if (inheritedFlow && !query.coveoFlow) {
        query.coveoFlow = inheritedFlow;
    }

    return query;
}

function normalizeListingViewUrl(url) {
    return String(url || '')
        .replace(/^\/s\/[^/]+/, '')
        .replace(/\/+$/, '');
}

function getRequestedFlow(querystring) {
    var flow = String(querystring && querystring.coveoFlow ? querystring.coveoFlow : '').toLowerCase();

    if (flow === 'native' || flow === 'coveo') {
        return flow;
    }

    return '';
}

function buildRequestDebugContext(req) {
    var httpParameterMap = req && req.httpParameterMap ? req.httpParameterMap : null;
    var normalizedQuery = buildRequestQuery(req);
    var paramsPayload = getHttpParameterValue(httpParameterMap, 'params');

    return {
        querystringCgid: req && req.querystring ? req.querystring.cgid || '' : '',
        querystringQ: req && req.querystring ? req.querystring.q || '' : '',
        httpParameterMapCgid: getHttpParameterValue(httpParameterMap, 'cgid'),
        httpParameterMapQ: getHttpParameterValue(httpParameterMap, 'q'),
        httpParameterMapParams: paramsPayload ? String(paramsPayload).slice(0, 500) : '',
        normalizedCgid: normalizedQuery.cgid || '',
        normalizedQ: normalizedQuery.q || '',
        normalizedPrefn1: normalizedQuery.prefn1 || '',
        normalizedPrefv1: normalizedQuery.prefv1 || ''
    };
}

function cloneQuery(querystring) {
    var source = querystring || {};
    var target = {};
    var normalizedValue;

    Object.keys(source).forEach(function (key) {
        normalizedValue = normalizeQueryValue(source[key]);

        if (normalizedValue !== '') {
            target[key] = normalizedValue;
        }
    });

    return target;
}

function isCoveoSearchRequest(querystring) {
    var effectiveQuery = querystring && querystring.querystring ? buildRequestQuery(querystring) : (querystring || {});
    var requestedFlow = getRequestedFlow(effectiveQuery);

    if (requestedFlow === 'native') {
        return false;
    }

    if (requestedFlow === 'coveo') {
        return !!(effectiveQuery && (effectiveQuery.q || effectiveQuery.cgid));
    }

    return !!(effectiveQuery && (effectiveQuery.q || effectiveQuery.cgid));
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

    if (query.preferences && typeof query.preferences === 'object') {
        Object.keys(query.preferences).forEach(function (attributeId) {
            var preferenceValue = query.preferences[attributeId];

            if (typeof preferenceValue === 'object' && preferenceValue !== null) {
                filters[attributeId] = preferenceValue;
                return;
            }

            filters[attributeId] = splitFacetValues(preferenceValue);
        });
    }

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

function isCategoryRequest(querystring) {
    return !!(querystring && querystring.cgid && !querystring.q);
}

function getCategory(querystring) {
    var categoryId = querystring && querystring.cgid ? String(querystring.cgid) : '';
    var CatalogMgr;

    if (!categoryId) {
        return null;
    }

    CatalogMgr = require('dw/catalog/CatalogMgr');

    return CatalogMgr.getCategory(categoryId);
}

function mapCategory(category) {
    var displayName;

    if (!category) {
        return null;
    }

    displayName = category.displayName || (category.getDisplayName ? category.getDisplayName() : '') || category.ID;

    return {
        name: displayName,
        id: category.ID,
        pageTitle: category.pageTitle || '',
        description: category.description || '',
        pageDescription: category.pageDescription || '',
        pageKeywords: category.pageKeywords || ''
    };
}

function isPriceFacet(facet) {
    var facetId = String((facet && facet.id) || '').toLowerCase();
    var facetType = String((facet && facet.type) || '').toLowerCase();

    return facetType === 'price' || /price|prix/.test(facetId);
}

function isCategoryFacet(refinement, rawRefinement) {
    var candidates = [
        refinement && refinement.id,
        rawRefinement && rawRefinement.facetId,
        rawRefinement && rawRefinement.field,
        rawRefinement && rawRefinement.type
    ];

    return candidates.some(function (candidate) {
        var normalized = String(candidate || '').toLowerCase();

        return normalized === 'category' ||
            normalized === 'categories' ||
            normalized === 'ec_category' ||
            normalized === 'hierarchicalcategory' ||
            normalized === 'hierarchical';
    });
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

function resolveFacetRequestId(refinement, rawRefinement) {
    var source = rawRefinement || {};

    return String(source.field || source.facetId || refinement.id || '');
}

function resolveRefinementAttributeId(refinement, rawRefinement) {
    var source = rawRefinement || {};
    var candidates = [
        source.facetId,
        refinement.id,
        source.field
    ];
    var index;
    var normalized;

    for (index = 0; index < candidates.length; index += 1) {
        normalized = String(candidates[index] || '').toLowerCase();

        if (STOREFRONT_REFINEMENT_ALIASES[normalized]) {
            return STOREFRONT_REFINEMENT_ALIASES[normalized];
        }
    }

    return String(source.facetId || refinement.id || source.field || '');
}

function resolveFacetValueId(value, rawValue, refinement) {
    var source = rawValue || {};

    if (refinement.type === 'numericalRange' && typeof source.start !== 'undefined' && typeof source.end !== 'undefined') {
        return ['range', source.start, source.end, source.endInclusive === false ? '0' : '1'].join(':');
    }

    if (source.path && typeof source.path.length === 'number' && source.path.length) {
        return source.path.join('|');
    }

    if (typeof source.value !== 'undefined' && source.value !== null && source.value !== '') {
        return String(source.value);
    }

    if (typeof source.name !== 'undefined' && source.name !== null && source.name !== '') {
        return String(source.name);
    }

    if (typeof source.id !== 'undefined' && source.id !== null && source.id !== '') {
        return String(source.id);
    }

    return String(value.id || value.label || '');
}

function getRawRefinementValues(rawRefinement) {
    var source = rawRefinement || {};

    if (source.values && source.values.length) {
        return source.values;
    }

    if (source.options && source.options.length) {
        return source.options;
    }

    return [];
}

function mapRefinementValues(refinement, rawRefinement, querystring, visibleCount) {
    var facetRequestId = resolveFacetRequestId(refinement, rawRefinement);
    var rawValues = getRawRefinementValues(rawRefinement);

    return (refinement.values || []).map(function (value, index) {
        var rawValue = rawValues[index] || {};
        var valueId = resolveFacetValueId(value, rawValue, refinement);
        var metadata = resolveValueMetadata(value, rawValue, refinement.id);

        return {
            id: valueId,
            url: buildFacetToggleUrl(querystring, facetRequestId, valueId, visibleCount),
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

function buildCategoryValueNode(rawValue, mappedValue, querystring, facetRequestId, visibleCount) {
    var path = rawValue && rawValue.path && typeof rawValue.path.length === 'number' ? rawValue.path : [];
    var fallbackLabel = mappedValue && (mappedValue.label || mappedValue.id) ? (mappedValue.label || mappedValue.id) : '';
    var leafLabel = path.length ? String(path[path.length - 1]) : fallbackLabel;
    var valueId = resolveFacetValueId(mappedValue || {}, rawValue || {}, { type: 'hierarchical' });

    return {
        id: valueId,
        type: 'category',
        displayValue: leafLabel,
        selected: mappedValue && mappedValue.selected === true,
        selectable: true,
        title: leafLabel,
        url: buildFacetToggleUrl(querystring, facetRequestId, valueId, visibleCount),
        subCategories: []
    };
}

function mapCategoryRefinementValues(refinement, rawRefinement, querystring, visibleCount) {
    var facetRequestId = resolveFacetRequestId(refinement, rawRefinement);
    var rawValues = getRawRefinementValues(rawRefinement);
    var roots = [];
    var nodesByPath = {};

    function ensurePathNode(labelPath, mappedValue, rawValue) {
        var parentPath = [];
        var currentNode = null;

        labelPath.forEach(function (segment, index) {
            var currentPath = labelPath.slice(0, index + 1);
            var pathKey = currentPath.join('|');
            var parentKey = parentPath.join('|');
            var parentNode = parentKey ? nodesByPath[parentKey] : null;

            if (!nodesByPath[pathKey]) {
                nodesByPath[pathKey] = {
                    id: index === labelPath.length - 1 ? resolveFacetValueId(mappedValue || {}, rawValue || {}, { type: 'hierarchical' }) : pathKey,
                    type: 'category',
                    displayValue: segment,
                    selected: index === labelPath.length - 1 && mappedValue && mappedValue.selected === true,
                    selectable: true,
                    title: segment,
                    url: index === labelPath.length - 1 ?
                        buildFacetToggleUrl(querystring, facetRequestId, resolveFacetValueId(mappedValue || {}, rawValue || {}, { type: 'hierarchical' }), visibleCount) :
                        '#',
                    subCategories: []
                };

                if (parentNode) {
                    parentNode.subCategories.push(nodesByPath[pathKey]);
                } else {
                    roots.push(nodesByPath[pathKey]);
                }
            } else if (index === labelPath.length - 1) {
                nodesByPath[pathKey].selected = mappedValue && mappedValue.selected === true;
                nodesByPath[pathKey].url = buildFacetToggleUrl(
                    querystring,
                    facetRequestId,
                    resolveFacetValueId(mappedValue || {}, rawValue || {}, { type: 'hierarchical' }),
                    visibleCount
                );
                nodesByPath[pathKey].id = resolveFacetValueId(mappedValue || {}, rawValue || {}, { type: 'hierarchical' });
            }

            currentNode = nodesByPath[pathKey];
            parentPath = currentPath;
        });

        return currentNode;
    }

    if (!rawValues.length) {
        return (refinement.values || []).map(function (mappedValue) {
            return buildCategoryValueNode(null, mappedValue, querystring, facetRequestId, visibleCount);
        });
    }

    rawValues.forEach(function (rawValue, index) {
        var mappedValue = (refinement.values || [])[index] || {};
        var path = rawValue && rawValue.path && typeof rawValue.path.length === 'number' ? rawValue.path : null;

        if (path && path.length) {
            ensurePathNode(path.map(String), mappedValue, rawValue);
            return;
        }

        roots.push(buildCategoryValueNode(rawValue, mappedValue, querystring, facetRequestId, visibleCount));
    });

    return roots;
}

function mapRefinements(searchResult, querystring, visibleCount) {
    var openRefinements = getListPreference('openRefinements');
    var hiddenRefinements = getListPreference('notVisibleRefinements');
    var rawFacets = (searchResult.raw && (searchResult.raw.facets || searchResult.raw.filters)) || [];

    return (searchResult.facets || []).map(function (refinement, index) {
        var rawRefinement = rawFacets[index] || {};
        var attributeId = resolveRefinementAttributeId(refinement, rawRefinement);
        var categoryRefinement = isCategoryFacet(refinement, rawRefinement);
        var values = categoryRefinement ?
            mapCategoryRefinementValues(refinement, rawRefinement, querystring, visibleCount) :
            mapRefinementValues(refinement, rawRefinement, querystring, visibleCount);
        var priceRefinement = isPriceFacet(refinement);

        return {
            attributeID: attributeId,
            displayName: refinement.label,
            isCategoryRefinement: categoryRefinement,
            isAttributeRefinement: !priceRefinement && !categoryRefinement,
            isPriceRefinement: priceRefinement,
            isPromotionRefinement: false,
            values: values,
            showOpen: openRefinements.indexOf(attributeId) >= 0 || openRefinements.indexOf(refinement.id) >= 0,
            display: hiddenRefinements.indexOf(attributeId) < 0 && hiddenRefinements.indexOf(refinement.id) < 0,
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
    var categoryRequest = isCategoryRequest(querystring);
    var category = categoryRequest ? mapCategory(getCategory(querystring)) : null;

    return {
        pageSize: getPageSize(querystring),
        pageNumber: getPageNumber(querystring),
        count: totalCount,
        isCategorySearch: categoryRequest,
        isRefinedCategorySearch: categoryRequest && refinements.some(function (refinement) {
            return refinement.values.some(function (value) {
                return value.selected;
            });
        }),
        searchKeywords: querystring.q || '',
        resetLink: buildResetLink(querystring),
        productIds: products,
        productSort: buildSortOptions(searchResult, querystring, visibleCount),
        showMoreUrl: buildShowMoreUrl(querystring, totalCount),
        permalink: buildPermalink(querystring, visibleCount),
        category: category,
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
    var rawQuery = buildRequestQuery(req);
    var query = cloneQuery(rawQuery);
    var params = cloneQuery(rawQuery);

    params.query = query.q || '';
    params.categoryId = query.cgid || '';
    params.page = getPageIndex(query);
    params.perPage = getPageSize(query);
    params.sort = parseJson(query.coveosort, query.sort || '');
    params.sortId = query.srule || '';
    params.filters = buildServiceFilters(rawQuery);
    params.currentCustomer = req.currentCustomer;
    params.coveoDebug = isCoveoDebugRequest(query);
    params.request = getHttpRequest();
    params.response = getHttpResponse();

    if (params.categoryId) {
        params.currentUrl = normalizeListingViewUrl(URLUtils.url('Search-Show', 'cgid', params.categoryId).toString());
    }

    return params;
}

function buildCategoryViewData(category) {
    if (!category) {
        return {
            category: null,
            apiProductSearch: null
        };
    }

    return {
        category: mapCategory(category),
        apiProductSearch: {
            category: category
        }
    };
}

function summarizeStorefrontRefinements(refinements) {
    return (refinements || []).map(function (refinement) {
        return {
            attributeID: refinement.attributeID || '',
            displayName: refinement.displayName || '',
            valuesCount: refinement.values ? refinement.values.length : 0,
            selectedValues: (refinement.values || []).filter(function (value) {
                return value.selected === true;
            }).map(function (value) {
                return value.displayValue || value.id || '';
            }).filter(function (value) {
                return !!value;
            })
        };
    });
}

function buildDebugData(params, querystring, result, productSearch) {
    return {
        flow: 'mondou-overlay',
        requestType: productSearch && productSearch.isCategorySearch ? 'listing' : 'search',
        routeQuery: {
            q: querystring.q || '',
            cgid: querystring.cgid || '',
            page: typeof params.page === 'number' ? params.page : null,
            perPage: typeof params.perPage === 'number' ? params.perPage : null,
            sortId: params.sortId || ''
        },
        storefront: {
            resultCount: typeof productSearch.count === 'number' ? productSearch.count : null,
            selectedFilters: productSearch.selectedFilters || [],
            headerRefinementIds: productSearch.refinements.filter(function (refinement) {
                return HEADER_REFINEMENTS[refinement.attributeID] === true;
            }).map(function (refinement) {
                return refinement.attributeID;
            }),
            refinements: summarizeStorefrontRefinements(productSearch.refinements)
        },
        commerce: result && result.debug ? result.debug : null
    };
}

function resolveResultDataLayer(result, params, querystring) {
    if (isCategoryRequest(querystring)) {
        return GtmHelper.buildListingResponseEvent(result, {
            categoryId: params.categoryId || params.cgid || '',
            searchHub: result.analytics.searchHub,
            pipeline: result.analytics.pipeline
        });
    }

    return GtmHelper.buildSearchResponseEvent(result, {
        query: params.query,
        searchHub: result.analytics.searchHub,
        pipeline: result.analytics.pipeline
    });
}

function execute(req) {
    var params = buildSearchParams(req);
    var querystring = buildRequestQuery(req);
    var category = getCategory(querystring);
    var result = isCategoryRequest(querystring) ? CommerceApiService.listing(params) : CommerceApiService.search(params);
    var productSearch = buildProductSearch(result, querystring);
    var categoryViewData = buildCategoryViewData(category);

    Logger.debug('Mapped Mondou Coveo search response.', {
        query: params.query,
        categoryId: params.categoryId || '',
        responseId: result.responseId
    });

    return {
        productSearch: productSearch,
        refineurl: buildRefineUrl(querystring),
        coveoSearch: result,
        coveoAnalytics: result.analytics,
        coveoDataLayer: resolveResultDataLayer(result, params, querystring),
        coveoDebugData: params.coveoDebug ? buildDebugData(params, querystring, result, productSearch) : null,
        category: categoryViewData.category,
        apiProductSearch: categoryViewData.apiProductSearch,
        headerRefinements: productSearch.refinements.filter(function (refinement) {
            return HEADER_REFINEMENTS[refinement.attributeID] === true;
        })
    };
}

module.exports = {
    buildRequestQuery: buildRequestQuery,
    buildRequestDebugContext: buildRequestDebugContext,
    getRequestedFlow: getRequestedFlow,
    isRequestDebugEnabled: isRequestDebugEnabled,
    normalizeListingViewUrl: normalizeListingViewUrl,
    isCoveoSearchRequest: isCoveoSearchRequest,
    execute: execute,
    search: execute
};
