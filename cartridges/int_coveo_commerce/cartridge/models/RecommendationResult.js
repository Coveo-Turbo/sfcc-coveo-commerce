'use strict';

function RecommendationResult(data) {
    var payload = data || {};

    this.recommendationId = payload.recommendationId || '';
    this.recommendations = payload.recommendations || [];
    this.responseId = payload.responseId || '';
    this.analytics = payload.analytics || {};
    this.raw = payload.raw || {};
    this.debug = payload.debug || null;
}

RecommendationResult.prototype.toJSON = function () {
    return {
        recommendationId: this.recommendationId,
        recommendations: this.recommendations,
        responseId: this.responseId,
        analytics: this.analytics
    };
};

module.exports = RecommendationResult;
