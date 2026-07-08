'use strict';

function mapValue(value) {
    var source = value || {};
    var valueId = source.id || source.value || source.name || '';

    return {
        id: valueId,
        label: source.label || source.displayValue || source.value || source.name || valueId,
        count: source.count || source.numberOfResults || 0,
        selected: source.selected === true || source.state === 'selected' || source.state === 'auto_selected',
        raw: source
    };
}

function map(facet) {
    var source = facet || {};
    var values = source.values || source.options || [];

    return {
        id: source.facetId || source.id || source.field || '',
        label: source.displayName || source.label || source.name || source.field || '',
        type: source.type || 'regular',
        values: values.map(mapValue),
        raw: source
    };
}

module.exports = {
    map: map
};
