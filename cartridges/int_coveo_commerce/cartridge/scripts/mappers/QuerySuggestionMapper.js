'use strict';

function normalizeSuggestionValue(item) {
    var value = item.expression || item.highlighted || item.value || item.query || item.label || '';

    return String(value)
        .replace(/\[/g, '')
        .replace(/\]/g, '')
        .replace(/[{}()]/g, '')
        .replace(/^\s+|\s+$/g, '');
}

function mapSuggestion(item) {
    if (typeof item === 'string') {
        return {
            value: item
        };
    }

    return {
        value: normalizeSuggestionValue(item || {}),
        highlighted: item && item.highlighted ? String(item.highlighted) : '',
        raw: item || {}
    };
}

function mapFieldSuggestionFacet(facet) {
    var source = facet || {};

    return {
        facetId: source.facetId || '',
        field: source.field || '',
        displayName: source.displayName || '',
        type: source.type || ''
    };
}

function map(response, analyticsContext) {
    var source = response || {};
    var suggestions = source.completions || source.suggestions || source.items || [];
    var fieldSuggestionsFacets = source.fieldSuggestionsFacets || [];

    return {
        suggestions: suggestions.map(mapSuggestion).filter(function (item) {
            return !!item.value;
        }),
        fieldSuggestionsFacets: fieldSuggestionsFacets.map(mapFieldSuggestionFacet).filter(function (facet) {
            return !!(facet.facetId || facet.field);
        }),
        responseId: source.responseId || '',
        queryUid: source.queryUid || '',
        analytics: {
            clientId: analyticsContext.clientId || '',
            responseId: source.responseId || '',
            queryUid: source.queryUid || '',
            searchHub: analyticsContext.searchHub || '',
            pipeline: analyticsContext.pipeline || ''
        }
    };
}

module.exports = {
    map: map
};
