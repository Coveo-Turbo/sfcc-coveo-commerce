'use strict';

function mapValue(value) {
    var source = value || {};

    return {
        id: source.id || source.value || source.name || '',
        label: source.label || source.value || source.name || '',
        count: source.count || source.numberOfResults || 0,
        selected: source.selected === true
    };
}

function map(facet) {
    var source = facet || {};
    var values = source.values || source.options || [];

    return {
        id: source.id || source.field || '',
        label: source.label || source.name || source.field || '',
        type: source.type || 'regular',
        values: values.map(mapValue),
        raw: source
    };
}

module.exports = {
    map: map
};
