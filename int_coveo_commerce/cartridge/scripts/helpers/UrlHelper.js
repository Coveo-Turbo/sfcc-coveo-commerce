'use strict';

function trimSlashes(value) {
    return String(value || '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function encodePair(key, value) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(value);
}

function buildQueryString(queryParams) {
    var keys;
    var parts = [];

    if (!queryParams) {
        return '';
    }

    keys = Object.keys(queryParams);

    keys.forEach(function (key) {
        var value = queryParams[key];

        if (value === null || typeof value === 'undefined' || value === '') {
            return;
        }

        if (Object.prototype.toString.call(value) === '[object Array]') {
            value.forEach(function (item) {
                parts.push(encodePair(key, item));
            });
            return;
        }

        parts.push(encodePair(key, value));
    });

    return parts.join('&');
}

function buildEndpoint(baseUrl, path, queryParams) {
    var normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
    var normalizedPath = trimSlashes(path);
    var queryString = buildQueryString(queryParams);
    var url = normalizedBase;

    if (normalizedPath) {
        url += '/' + normalizedPath;
    }

    if (queryString) {
        url += '?' + queryString;
    }

    return url;
}

module.exports = {
    buildEndpoint: buildEndpoint,
    buildQueryString: buildQueryString
};
