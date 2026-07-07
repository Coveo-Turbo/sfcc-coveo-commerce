'use strict';

var ProductMapper = require('*/cartridge/scripts/mappers/ProductMapper');
var FacetMapper = require('*/cartridge/scripts/mappers/FacetMapper');
var PaginationMapper = require('*/cartridge/scripts/mappers/PaginationMapper');
var SortMapper = require('*/cartridge/scripts/mappers/SortMapper');

function map(response, params, analyticsContext) {
    var source = response || {};
    var products = source.products || source.results || [];
    var facets = source.facets || source.filters || [];

    return {
        categoryId: source.categoryId || params.categoryId || params.cgid || '',
        products: products.map(ProductMapper.map),
        facets: facets.map(FacetMapper.map),
        pagination: PaginationMapper.map(source, params),
        sorting: SortMapper.map(source, params),
        breadcrumbs: source.breadcrumbs || source.breadCrumbs || [],
        responseId: source.responseId || '',
        queryUid: source.queryUid || '',
        analytics: {
            clientId: analyticsContext.clientId || '',
            responseId: source.responseId || '',
            queryUid: source.queryUid || '',
            searchHub: analyticsContext.searchHub || '',
            pipeline: analyticsContext.pipeline || ''
        },
        raw: source
    };
}

module.exports = {
    map: map
};
