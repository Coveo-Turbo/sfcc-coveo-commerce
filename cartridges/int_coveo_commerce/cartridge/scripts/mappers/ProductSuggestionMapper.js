'use strict';

var ProductMapper = require('*/cartridge/scripts/mappers/ProductMapper');

function mapProducts(response) {
    var source = response || {};
    var products = source.products || source.results || source.items || [];

    return products.map(ProductMapper.map);
}

function map(response, params, analyticsContext) {
    var source = response || {};

    return {
        products: mapProducts(source),
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
