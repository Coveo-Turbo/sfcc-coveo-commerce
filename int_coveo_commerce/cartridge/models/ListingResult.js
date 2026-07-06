'use strict';

function ListingResult(data) {
    var payload = data || {};

    this.categoryId = payload.categoryId || '';
    this.products = payload.products || [];
    this.facets = payload.facets || [];
    this.pagination = payload.pagination || {};
    this.sorting = payload.sorting || {};
    this.breadcrumbs = payload.breadcrumbs || [];
    this.responseId = payload.responseId || '';
    this.queryUid = payload.queryUid || '';
    this.analytics = payload.analytics || {};
    this.raw = payload.raw || {};
}

ListingResult.prototype.toJSON = function () {
    return {
        categoryId: this.categoryId,
        products: this.products,
        facets: this.facets,
        pagination: this.pagination,
        sorting: this.sorting,
        breadcrumbs: this.breadcrumbs,
        responseId: this.responseId,
        queryUid: this.queryUid,
        analytics: this.analytics
    };
};

module.exports = ListingResult;
