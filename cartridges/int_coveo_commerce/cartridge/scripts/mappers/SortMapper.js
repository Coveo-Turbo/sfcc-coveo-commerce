'use strict';

function mapOption(option, selected) {
    var source = option || {};
    var id = source.id || source.value || source.name || '';

    return {
        id: id,
        label: source.label || source.name || id,
        selected: source.selected === true || id === selected
    };
}

function map(response, params) {
    var source = response || {};
    var requestParams = params || {};
    var options = source.sortOptions || source.sorting || [];
    var selected = requestParams.sort || source.selectedSort || '';

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
