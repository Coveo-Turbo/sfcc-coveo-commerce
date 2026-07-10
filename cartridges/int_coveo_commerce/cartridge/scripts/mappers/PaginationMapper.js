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
    var pagination = source.pagination || {};
    var page = normalizeNumber(
        pagination.page || source.page || source.currentPage || requestParams.page,
        0
    );
    var perPage = normalizeNumber(
        pagination.perPage || source.perPage || source.pageSize || requestParams.perPage || requestParams.sz,
        12
    );
    var total = normalizeNumber(
        pagination.totalProducts ||
        pagination.totalEntries ||
        source.totalEntries ||
        source.totalCount ||
        source.total ||
        source.totalResults,
        0
    );
    var totalPages = normalizeNumber(pagination.totalPages || source.totalPages, 0);

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
