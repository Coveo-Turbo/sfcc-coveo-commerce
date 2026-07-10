'use strict';

function buildId(option) {
    var source = option || {};
    var fields;

    if (source.sortCriteria === 'relevance') {
        return 'relevance';
    }

    if (source.sortCriteria === 'fields' && source.fields && source.fields.length) {
        fields = source.fields.map(function (field) {
            return [field.field, field.direction].join(':');
        }).join('|');

        return 'fields:' + fields;
    }

    return source.id || source.value || source.name || '';
}

function buildLabel(option) {
    var source = option || {};
    var firstField;

    if (source.sortCriteria === 'relevance') {
        return 'Relevance';
    }

    firstField = source.fields && source.fields.length ? source.fields[0] : null;

    if (firstField && firstField.displayName) {
        return firstField.displayName;
    }

    return source.label || source.name || buildId(source);
}

function mapOption(option, selected) {
    var source = option || {};
    var id = buildId(source);

    return {
        id: id,
        label: buildLabel(source),
        selected: source.selected === true || id === selected,
        raw: source
    };
}

function map(response, params) {
    var source = response || {};
    var requestParams = params || {};
    var sort = source.sort || {};
    var options = sort.availableSorts || source.availableSorts || source.sortOptions || source.sorting || [];
    var selected = buildId(sort.appliedSort || source.appliedSort || {}) || requestParams.sortId || requestParams.sort || '';

    return {
        selected: selected,
        options: options.map(function (option) {
            return mapOption(option, selected);
        })
    };
}

module.exports = {
    map: map
};
