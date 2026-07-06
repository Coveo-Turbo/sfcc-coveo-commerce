'use strict';

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function map(response, params) {
    var source = response || {};
    var requestParams = params || {};
    var page = normalizeNumber(source.page || source.currentPage || requestParams.page, 1);
    var perPage = normalizeNumber(source.perPage || source.pageSize || requestParams.perPage || requestParams.sz, 12);
    var total = normalizeNumber(source.totalCount || source.total || source.totalResults, 0);
    var totalPages = normalizeNumber(source.totalPages, 0);

    if (!totalPages && perPage > 0) {
        totalPages = Math.ceil(total / perPage);
    }

    return {
        page: page,
        perPage: perPage,
        total: total,
        totalPages: totalPages
    };
}

module.exports = {
    map: map
};
