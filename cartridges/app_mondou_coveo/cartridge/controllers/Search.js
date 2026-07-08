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

function buildNativeHeaderRefinements(refinements) {
    return refinements.filter(function (refinement) {
        return refinement.attributeID === 'recurrence' || refinement.attributeID === 'brand';
    });
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

    setFlowViewData(res, 'native');

    if (req.querystring.cgid) {
        var pageLookupResult = searchHelper.getPageDesignerCategoryPage(req.querystring.cgid);

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
        contentSearch = searchHelper.setupContentSearch(req.querystring);
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
        canonicalUrl: req.querystring.cgid ? URLUtils.abs('Search-Show', 'cgid', req.querystring.cgid) : null,
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
        topBannerBackgroundPosition: topBannerBackgroundPosition
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

    setFlowViewData(res, 'native');

    apiProductSearch = searchHelper.setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    apiProductSearch.search();

    if (!apiProductSearch.personalizedSort) {
        searchHelper.applyCache(res);
    }

    productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
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

    setFlowViewData(res, 'native');

    apiProductSearch = searchHelper.setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    apiProductSearch.search();
    productSearch = new ProductSearch(
        apiProductSearch,
        req.querystring,
        req.querystring.srule,
        CatalogMgr.getSortingOptions(),
        CatalogMgr.getSiteCatalog().getRoot()
    );

    res.render('/search/searchRefineBar', {
        productSearch: productSearch,
        querystring: req.querystring
    });

    return next();
}

function renderNativeShowAjax(req, res, next) {
    var gtm = require('int_gtm');
    var productHelper = require('*/cartridge/scripts/helpers/productHelpers');
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
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
        breadcrumbs: breadcrumbs
    });

    return next();
}

function renderCoveoShow(req, res, next) {
    var Site = require('dw/system/Site').getCurrent();
    var isGtmEnabled = Site.getCustomPreferenceValue('gtmEnabled');
    var gtmDataProductList;
    var searchHelper = require('*/cartridge/scripts/helpers/searchHelpers');
    var result = coveoSearchHelper.search(req);
    var contentSearch = searchHelper.setupContentSearch(req.querystring);

    setFlowViewData(res, 'mondou-overlay');

    if (isGtmEnabled) {
        gtmDataProductList = require('int_gtm').gtmProductList(result.productSearch);
    }

    res.render('search/searchResults', {
        productSearch: result.productSearch,
        maxSlots: null,
        reportingURLs: null,
        refineurl: result.refineurl,
        category: null,
        canonicalUrl: null,
        schemaData: null,
        apiProductSearch: null,
        breadcrumbs: null,
        gtmDataProductList: gtmDataProductList,
        headerRefinements: result.headerRefinements,
        bannerImageUrl: null,
        contentSearchCount: contentSearch && contentSearch.contentCount ? contentSearch.contentCount : 0,
        topBannerBackgroundColor: null,
        topBannerTextColor: null,
        topBannerContentAssetID: null,
        topBannerBackgroundSize: null,
        topBannerBackgroundRepeat: null,
        topBannerBackgroundPosition: null,
        disableMondouCoveoBundle: true,
        coveoSearch: result.coveoSearch,
        coveoAnalytics: result.coveoAnalytics,
        coveoDataLayer: result.coveoDataLayer
    });

    return next();
}

function renderCoveoShowAjax(req, res, next) {
    var gtm = require('int_gtm');
    var result = coveoSearchHelper.search(req);

    setFlowViewData(res, 'mondou-overlay');

    res.render('search/searchResultsNoDecorator', {
        productSearch: result.productSearch,
        maxSlots: null,
        reportingURLs: null,
        refineurl: result.refineurl,
        apiProductSearch: null,
        headerRefinements: result.headerRefinements,
        breadcrumbs: null,
        gtmDataVPV: gtm.gtmVirtualPageView(result.productSearch.refinements),
        coveoSearch: result.coveoSearch,
        coveoAnalytics: result.coveoAnalytics,
        coveoDataLayer: result.coveoDataLayer
    });

    return next();
}

function renderCoveoUpdateGrid(req, res, next) {
    var result = coveoSearchHelper.search(req);

    setFlowViewData(res, 'mondou-overlay');

    res.render('/search/productGrid', {
        productSearch: result.productSearch
    });

    return next();
}

function renderCoveoRefinebar(req, res, next) {
    var result = coveoSearchHelper.search(req);

    setFlowViewData(res, 'mondou-overlay');

    res.render('/search/searchRefineBar', {
        productSearch: result.productSearch,
        querystring: req.querystring
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
    Logger.warn('Mondou Coveo overlay Search-Show reached.', {
        query: req.querystring.q || '',
        hasCategoryId: !!req.querystring.cgid,
        isCoveoSearchRequest: coveoSearchHelper.isCoveoSearchRequest(req.querystring)
    });

    addBazaarvoiceScout(res);

    if (!coveoSearchHelper.isCoveoSearchRequest(req.querystring)) {
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
    if (!coveoSearchHelper.isCoveoSearchRequest(req.querystring)) {
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
    if (!coveoSearchHelper.isCoveoSearchRequest(req.querystring)) {
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
    if (!coveoSearchHelper.isCoveoSearchRequest(req.querystring)) {
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
