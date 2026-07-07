'use strict';

var ProductMapper = require('*/cartridge/scripts/mappers/ProductMapper');

function map(response, params, analyticsContext) {
    var source = response || {};
    var recommendations = source.recommendations || source.products || source.results || [];

    return {
        recommendationId: source.recommendationId || params.slotId || '',
        recommendations: recommendations.map(ProductMapper.map),
        responseId: source.responseId || '',
        analytics: {
            clientId: analyticsContext.clientId || '',
            responseId: source.responseId || '',
            searchHub: analyticsContext.searchHub || '',
            pipeline: analyticsContext.pipeline || ''
        },
        raw: source
    };
}

module.exports = {
    map: map
};
