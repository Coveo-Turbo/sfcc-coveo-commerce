'use strict';

function mapValue(value) {
    var source = value || {};

    return {
        displayValue: source.displayValue || '',
        rawValue: typeof source.rawValue !== 'undefined' ? source.rawValue : '',
        path: Object.prototype.toString.call(source.path) === '[object Array]' ? source.path : [],
        count: typeof source.count === 'number' ? source.count : 0
    };
}

function map(response, params, analyticsContext) {
    var source = response || {};
    var values = Object.prototype.toString.call(source.values) === '[object Array]' ? source.values : [];

    return {
        facetId: params.facetId || '',
        values: values.map(mapValue),
        moreValuesAvailable: source.moreValuesAvailable === true,
        analytics: {
            clientId: analyticsContext.clientId || '',
            searchHub: analyticsContext.searchHub || '',
            pipeline: analyticsContext.pipeline || ''
        },
        raw: source
    };
}

module.exports = {
    map: map
};
