'use strict';

var server = require('server');

server.extend(module.superModule);

var cache = require('*/cartridge/scripts/middleware/cache');
var consentTracking = require('*/cartridge/scripts/middleware/consentTracking');
var pageMetaData = require('*/cartridge/scripts/middleware/pageMetaData');
var coveoSearchHelper = require('*/cartridge/scripts/helpers/coveoSearchHelpers');
var Logger = require('int_coveo_commerce/cartridge/scripts/helpers/Logger');

function addBazaarvoiceScout(res) {
    var BVHelper = require('*/cartridge/scripts/lib/libBazaarvoice').getBazaarVoiceHelper();
    var Site = require('dw/system/Site').getCurrent();
    var ratingPref = Site.getCustomPreferenceValue('bvEnableInlineRatings_C2013');
    var quickviewPref = Site.getCustomPreferenceValue('bvQuickViewRatingsType_C2013');
    var addScout = false;
    var viewData;

    if ((ratingPref && ratingPref.value && ratingPref.value.equals('hosted')) ||
        (quickviewPref && quickviewPref.value && quickviewPref.value.equals('pdpsummary'))) {
        addScout = true;
    }

    if (!addScout) {
        return;
    }

    viewData = res.getViewData();
    viewData.bvScout = BVHelper.getBvLoaderUrl();
    res.setViewData(viewData);
}

function setFlowViewData(res, flow) {
    res.setViewData({
        coveoFlow: flow,
        coveoFlowSource: 'app_mondou_coveo'
    });
}

function buildNativeDebugData(req, reason) {
    var query = coveoSearchHelper.buildRequestQuery(req);

    if (!coveoSearchHelper.isRequestDebugEnabled(req)) {
        return null;
    }

    return {
        flow: 'native',
        reason: reason || 'native-flow',
        routeQuery: {
            q: query.q || '',
            cgid: query.cgid || '',
            coveoFlow: query.coveoFlow || ''
        },
        requestContext: coveoSearchHelper.buildRequestDebugContext(req),
        commerce: null
    };
}

function buildNativeHeaderRefinements(refinements) {
    return refinements.filter(function (refinement) {
        return refinement.attributeID === 'recurrence' || refinement.attributeID === 'brand';
    });
}

function ensureNativeFlowQuery(req) {
    var effectiveQuery = coveoSearchHelper.buildRequestQuery(req);

    if (effectiveQuery.coveoFlow === 'native' && req && req.querystring) {
        req.querystring.coveoFlow = 'native';
    }

    return effectiveQuery;
}

function renderNativeShow(req, res, next) {
    var Site = require('dw/system/Site').getCurrent();
    var URLUtils = require('dw/web/URLUtils');
    var isGtmEnabled = Site.getCustomPreferenceValue('gtmEnabled');
    var gtmDataProductList;
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var template = 'search/searchResults';
    var result;
    var category;
    var breadcrumbs;
    var contentSearch;
    var Resource;
    var productHelper;
    var initialBreadCrumb;
    var headerRefinements;
    var bannerImageUrl;
    var topBannerBackgroundColor;
    var topBannerTextColor;
    var topBannerContentAssetID;
    var topBannerBackgroundSize;
    var topBannerBackgroundRepeat;
    var topBannerBackgroundPosition;
    var categoryObj;
    var effectiveQuery = ensureNativeFlowQuery(req);

    setFlowViewData(res, 'native');

    if (effectiveQuery.cgid) {
        var pageLookupResult = searchHelper.getPageDesignerCategoryPage(effectiveQuery.cgid);

        if ((pageLookupResult.page && pageLookupResult.page.hasVisibilityRules()) || pageLookupResult.invisiblePage) {
            res.cachePeriod = 0;
        }

        if (pageLookupResult.page) {
            res.page(pageLookupResult.page.ID, {}, pageLookupResult.aspectAttributes);
            return next();
        }
    }

    result = searchHelper.search(req, res);

    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    if (result.category && result.categoryTemplate) {
        template = result.categoryTemplate;
    } else if (result && result.apiProductSearch && result.apiProductSearch.category && result.apiProductSearch.category.template) {
        template = result.apiProductSearch.category.template;
    }

    category = result.productSearch.category;

    if (category) {
        Resource = require('dw/web/Resource');
        productHelper = require('*/cartridge/scripts/helpers/productHelpers');
        initialBreadCrumb = [{
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString()
        }];
        breadcrumbs = initialBreadCrumb.concat(productHelper.getAllBreadcrumbs(category.id, null, []).reverse());
    } else {
        contentSearch = searchHelper.setupContentSearch(effectiveQuery);
    }

    if (isGtmEnabled) {
        gtmDataProductList = require('int_gtm').gtmProductList(result.productSearch);
    }

    headerRefinements = buildNativeHeaderRefinements(result.productSearch.refinements);
    categoryObj = result.apiProductSearch && result.apiProductSearch.category;

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerImage) {
        bannerImageUrl = categoryObj.custom.topBannerImage.url.toString();
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundColor) {
        topBannerBackgroundColor = categoryObj.custom.topBannerBackgroundColor;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerTextColor) {
        topBannerTextColor = categoryObj.custom.topBannerTextColor;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerContentAssetID) {
        topBannerContentAssetID = categoryObj.custom.topBannerContentAssetID;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundSize) {
        topBannerBackgroundSize = categoryObj.custom.topBannerBackgroundSize;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundRepeat) {
        topBannerBackgroundRepeat = categoryObj.custom.topBannerBackgroundRepeat;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundPosition) {
        topBannerBackgroundPosition = categoryObj.custom.topBannerBackgroundPosition;
    }

    res.render(template, {
        productSearch: result.productSearch,
        maxSlots: result.maxSlots,
        reportingURLs: result.reportingURLs,
        refineurl: result.refineurl,
        category: result.category ? result.category : null,
        canonicalUrl: effectiveQuery.cgid ? URLUtils.abs('Search-Show', 'cgid', effectiveQuery.cgid, 'coveoFlow', 'native') : null,
        schemaData: result.schemaData,
        apiProductSearch: result.apiProductSearch,
        breadcrumbs: breadcrumbs,
        gtmDataProductList: gtmDataProductList,
        headerRefinements: headerRefinements,
        bannerImageUrl: bannerImageUrl,
        contentSearchCount: contentSearch && contentSearch.contentCount ? contentSearch.contentCount : 0,
        topBannerBackgroundColor: topBannerBackgroundColor,
        topBannerTextColor: topBannerTextColor,
        topBannerContentAssetID: topBannerContentAssetID,
        topBannerBackgroundSize: topBannerBackgroundSize,
        topBannerBackgroundRepeat: topBannerBackgroundRepeat,
        topBannerBackgroundPosition: topBannerBackgroundPosition,
        coveoDebugData: buildNativeDebugData(req, 'native-render')
    });

    return next();
}

function renderNativeUpdateGrid(req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var apiProductSearch = new ProductSearchModel();
    var productSearch;
    var effectiveQuery = ensureNativeFlowQuery(req);

    setFlowViewData(res, 'native');

    apiProductSearch = searchHelper.setupSearch(apiProductSearch, effectiveQuery, req.httpParameterMap);
    apiProductSearch.search();

    if (!apiProductSearch.personalizedSort) {
        searchHelper.applyCache(res);
    }

    productSearch = new ProductSearch(
        apiProductSearch,
        effectiveQuery,
        effectiveQuery.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('/search/productGrid', {
        productSearch: productSearch
    });

    return next();
}

function renderNativeRefinebar(req, res, next) {
    var CatalogMgr = require('dw/catalog/CatalogMgr');
    var ProductSearchModel = require('dw/catalog/ProductSearchModel');
    var ProductSearch = require('*/cartridge/models/search/productSearch');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var apiProductSearch = new ProductSearchModel();
    var productSearch;
    var effectiveQuery = ensureNativeFlowQuery(req);

    setFlowViewData(res, 'native');

    apiProductSearch = searchHelper.setupSearch(apiProductSearch, effectiveQuery, req.httpParameterMap);
    apiProductSearch.search();
    productSearch = new ProductSearch(
        apiProductSearch,
        effectiveQuery,
        effectiveQuery.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('/search/searchRefineBar', {
        productSearch: productSearch,
        querystring: effectiveQuery
    });

    return next();
}

function renderNativeShowAjax(req, res, next) {
    var gtm = require('int_gtm');
    var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    ensureNativeFlowQuery(req);
    var result = searchHelper.search(req, res);
    var headerRefinements;
    var breadcrumbs;

    setFlowViewData(res, 'native');

    if (result.searchRedirect) {
        res.redirect(result.searchRedirect);
        return next();
    }

    headerRefinements = buildNativeHeaderRefinements(result.productSearch.refinements);

    if (result.productSearch.category) {
        breadcrumbs = productHelper.getAllBreadcrumbs(result.productSearch.category.id, null, []).reverse();
    }

    res.render('search/searchResultsNoDecorator', {
        productSearch: result.productSearch,
        maxSlots: result.maxSlots,
        reportingURLs: result.reportingURLs,
        refineurl: result.refineurl,
        apiProductSearch: result.apiProductSearch,
        gtmDataVPV: gtm.gtmVirtualPageView(result.productSearch.refinements),
        headerRefinements: headerRefinements,
        breadcrumbs: breadcrumbs,
        coveoDebugData: buildNativeDebugData(req, 'native-ajax-render')
    });

    return next();
}

function renderCoveoShow(req, res, next) {
    var Site = require('dw/system/Site').getCurrent();
    var URLUtils = require('dw/web/URLUtils');
    var Resource = require('dw/web/Resource');
    var isGtmEnabled = Site.getCustomPreferenceValue('gtmEnabled');
    var gtmDataProductList;
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
    var result = coveoSearchHelper.execute(req);
    var contentSearch = result.productSearch.isCategorySearch ? null : searchHelper.setupContentSearch(req.querystring);
    var breadcrumbs = null;
    var categoryObj = result.apiProductSearch && result.apiProductSearch.category;
    var bannerImageUrl = null;
    var topBannerBackgroundColor = null;
    var topBannerTextColor = null;
    var topBannerContentAssetID = null;
    var topBannerBackgroundSize = null;
    var topBannerBackgroundRepeat = null;
    var topBannerBackgroundPosition = null;
    var initialBreadCrumb;
    var effectiveQuery = coveoSearchHelper.buildRequestQuery(req);

    setFlowViewData(res, 'mondou-overlay');

    if (isGtmEnabled) {
        gtmDataProductList = require('int_gtm').gtmProductList(result.productSearch);
    }

    if (result.productSearch.category) {
        initialBreadCrumb = [{
            htmlValue: Resource.msg('global.home', 'common', null),
            url: URLUtils.home().toString()
        }];
        breadcrumbs = initialBreadCrumb.concat(productHelper.getAllBreadcrumbs(result.productSearch.category.id, null, []).reverse());
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerImage) {
        bannerImageUrl = categoryObj.custom.topBannerImage.url.toString();
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundColor) {
        topBannerBackgroundColor = categoryObj.custom.topBannerBackgroundColor;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerTextColor) {
        topBannerTextColor = categoryObj.custom.topBannerTextColor;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerContentAssetID) {
        topBannerContentAssetID = categoryObj.custom.topBannerContentAssetID;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundSize) {
        topBannerBackgroundSize = categoryObj.custom.topBannerBackgroundSize;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundRepeat) {
        topBannerBackgroundRepeat = categoryObj.custom.topBannerBackgroundRepeat;
    }

    if (categoryObj && categoryObj.custom && categoryObj.custom.topBannerBackgroundPosition) {
        topBannerBackgroundPosition = categoryObj.custom.topBannerBackgroundPosition;
    }

    res.render('search/searchResults', {
        productSearch: result.productSearch,
        maxSlots: null,
        reportingURLs: null,
        refineurl: result.refineurl,
        category: result.category,
        canonicalUrl: result.productSearch.isCategorySearch ? URLUtils.abs('Search-Show', 'cgid', effectiveQuery.cgid) : null,
        schemaData: null,
        apiProductSearch: result.apiProductSearch,
        breadcrumbs: breadcrumbs,
        gtmDataProductList: gtmDataProductList,
        headerRefinements: result.headerRefinements,
        bannerImageUrl: bannerImageUrl,
        contentSearchCount: contentSearch && contentSearch.contentCount ? contentSearch.contentCount : 0,
        topBannerBackgroundColor: topBannerBackgroundColor,
        topBannerTextColor: topBannerTextColor,
        topBannerContentAssetID: topBannerContentAssetID,
        topBannerBackgroundSize: topBannerBackgroundSize,
        topBannerBackgroundRepeat: topBannerBackgroundRepeat,
        topBannerBackgroundPosition: topBannerBackgroundPosition,
        disableMondouCoveoBundle: true,
        coveoSearch: result.coveoSearch,
        coveoAnalytics: result.coveoAnalytics,
        coveoDataLayer: result.coveoDataLayer,
        coveoDebugData: result.coveoDebugData
    });

    return next();
}

function renderCoveoShowAjax(req, res, next) {
    var gtm = require('int_gtm');
    var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
    var result = coveoSearchHelper.execute(req);
    var breadcrumbs = null;

    setFlowViewData(res, 'mondou-overlay');

    if (result.productSearch.category) {
        breadcrumbs = productHelper.getAllBreadcrumbs(result.productSearch.category.id, null, []).reverse();
    }

    res.render('search/searchResultsNoDecorator', {
        productSearch: result.productSearch,
        maxSlots: null,
        reportingURLs: null,
        refineurl: result.refineurl,
        apiProductSearch: result.apiProductSearch,
        headerRefinements: result.headerRefinements,
        breadcrumbs: breadcrumbs,
        gtmDataVPV: gtm.gtmVirtualPageView(result.productSearch.refinements),
        coveoSearch: result.coveoSearch,
        coveoAnalytics: result.coveoAnalytics,
        coveoDataLayer: result.coveoDataLayer,
        coveoDebugData: result.coveoDebugData
    });

    return next();
}

function renderCoveoUpdateGrid(req, res, next) {
    var result = coveoSearchHelper.execute(req);

    setFlowViewData(res, 'mondou-overlay');

    res.render('/search/productGrid', {
        productSearch: result.productSearch,
        coveoDataLayer: result.coveoDataLayer,
        coveoDebugData: result.coveoDebugData
    });

    return next();
}

function renderCoveoRefinebar(req, res, next) {
    var result = coveoSearchHelper.execute(req);

    setFlowViewData(res, 'mondou-overlay');

    res.render('/search/searchRefineBar', {
        productSearch: result.productSearch,
        querystring: req.querystring,
        coveoDebugData: result.coveoDebugData
    });

    return next();
}

function logAndFallback(routeName, error) {
    Logger.warn('Falling back to native Mondou search flow.', {
        route: routeName,
        message: error.message,
        stack: error.stack
    });
}

server.replace('Show', cache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    var isCoveoRequest;

    addBazaarvoiceScout(res);

    isCoveoRequest = coveoSearchHelper.isCoveoSearchRequest(req);

    if (!isCoveoRequest) {
        if (coveoSearchHelper.isRequestDebugEnabled(req)) {
            Logger.warn('Mondou Coveo overlay classified Search-Show request as native.', coveoSearchHelper.buildRequestDebugContext(req));
        }
        return renderNativeShow(req, res, next);
    }

    try {
        return renderCoveoShow(req, res, next);
    } catch (error) {
        logAndFallback('Show', error);
        return renderNativeShow(req, res, next);
    }
}, pageMetaData.computedPageMetaData);

server.replace('ShowAjax', cache.applyShortPromotionSensitiveCache, consentTracking.consent, function (req, res, next) {
    if (!coveoSearchHelper.isCoveoSearchRequest(req)) {
        if (coveoSearchHelper.isRequestDebugEnabled(req)) {
            Logger.warn('Mondou Coveo overlay classified Search-ShowAjax request as native.', coveoSearchHelper.buildRequestDebugContext(req));
        }
        return renderNativeShowAjax(req, res, next);
    }

    try {
        return renderCoveoShowAjax(req, res, next);
    } catch (error) {
        logAndFallback('ShowAjax', error);
        return renderNativeShowAjax(req, res, next);
    }
}, pageMetaData.computedPageMetaData);

server.replace('UpdateGrid', function (req, res, next) {
    if (!coveoSearchHelper.isCoveoSearchRequest(req)) {
        if (coveoSearchHelper.isRequestDebugEnabled(req)) {
            Logger.warn('Mondou Coveo overlay classified Search-UpdateGrid request as native.', coveoSearchHelper.buildRequestDebugContext(req));
        }
        return renderNativeUpdateGrid(req, res, next);
    }

    try {
        return renderCoveoUpdateGrid(req, res, next);
    } catch (error) {
        logAndFallback('UpdateGrid', error);
        return renderNativeUpdateGrid(req, res, next);
    }
});

server.replace('Refinebar', cache.applyDefaultCache, function (req, res, next) {
    if (!coveoSearchHelper.isCoveoSearchRequest(req)) {
        if (coveoSearchHelper.isRequestDebugEnabled(req)) {
            Logger.warn('Mondou Coveo overlay classified Search-Refinebar request as native.', coveoSearchHelper.buildRequestDebugContext(req));
        }
        return renderNativeRefinebar(req, res, next);
    }

    try {
        return renderCoveoRefinebar(req, res, next);
    } catch (error) {
        logAndFallback('Refinebar', error);
        return renderNativeRefinebar(req, res, next);
    }
}, pageMetaData.computedPageMetaData);

module.exports = server.exports();
