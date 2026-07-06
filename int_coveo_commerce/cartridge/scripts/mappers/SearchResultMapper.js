'use strict';

var ProductMapper = require('*/cartridge/scripts/mappers/ProductMapper');
var FacetMapper = require('*/cartridge/scripts/mappers/FacetMapper');
var PaginationMapper = require('*/cartridge/scripts/mappers/PaginationMapper');
var SortMapper = require('*/cartridge/scripts/mappers/SortMapper');

function mapProducts(response) {
    var products = response.products || response.results || [];

    return products.map(ProductMapper.map);
}

function mapFacets(response) {
    var facets = response.facets || response.filters || [];

    return facets.map(FacetMapper.map);
}

function map(response, params, analyticsContext) {
    var source = response || {};

    return {
        products: mapProducts(source),
        facets: mapFacets(source),
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
