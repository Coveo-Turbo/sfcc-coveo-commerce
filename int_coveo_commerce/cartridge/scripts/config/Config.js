'use strict';

var Site = require('dw/system/Site');

var DEFAULT_TIMEOUT_MILLIS = 5000;
var DEFAULT_RETRY_COUNT = 1;

var PREFERENCES = {
    ORGANIZATION_ID: 'coveoCommerceOrganizationId',
    API_ENDPOINT: 'coveoCommerceApiEndpoint',
    API_TOKEN: 'coveoCommerceApiToken',
    DEFAULT_CATALOG: 'coveoCommerceDefaultCatalog',
    LOCALE: 'coveoCommerceLocale',
    CURRENCY: 'coveoCommerceCurrency',
    SEARCH_HUB: 'coveoCommerceSearchHub',
    PIPELINE: 'coveoCommercePipeline',
    ANALYTICS_ENABLED: 'coveoCommerceAnalyticsEnabled',
    VERBOSE_LOGGING: 'coveoCommerceVerboseLogging',
    TIMEOUT_MILLIS: 'coveoCommerceTimeoutMillis',
    RETRY_COUNT: 'coveoCommerceRetryCount'
};

function normalizeNumber(value, fallback) {
    var parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
        return fallback;
    }

    return parsed;
}

function normalizeBoolean(value, fallback) {
    if (value === null || typeof value === 'undefined' || value === '') {
        return fallback;
    }

    return value === true || value === 'true' || value === '1';
}

function getPreferenceValue(site, preferenceId, fallback) {
    var value;

    if (!site || !site.getCustomPreferenceValue) {
        return fallback;
    }

    value = site.getCustomPreferenceValue(preferenceId);

    if (value === null || typeof value === 'undefined' || value === '') {
        return fallback;
    }

    return value;
}

function getSettings() {
    var site = Site.getCurrent();

    return {
        organizationId: getPreferenceValue(site, PREFERENCES.ORGANIZATION_ID, ''),
        apiEndpoint: getPreferenceValue(site, PREFERENCES.API_ENDPOINT, ''),
        apiToken: getPreferenceValue(site, PREFERENCES.API_TOKEN, ''),
        defaultCatalog: getPreferenceValue(site, PREFERENCES.DEFAULT_CATALOG, ''),
        locale: getPreferenceValue(site, PREFERENCES.LOCALE, ''),
        currency: getPreferenceValue(site, PREFERENCES.CURRENCY, ''),
        searchHub: getPreferenceValue(site, PREFERENCES.SEARCH_HUB, ''),
        pipeline: getPreferenceValue(site, PREFERENCES.PIPELINE, ''),
        analyticsEnabled: normalizeBoolean(getPreferenceValue(site, PREFERENCES.ANALYTICS_ENABLED, true), true),
        verboseLogging: normalizeBoolean(getPreferenceValue(site, PREFERENCES.VERBOSE_LOGGING, false), false),
        timeoutMillis: normalizeNumber(getPreferenceValue(site, PREFERENCES.TIMEOUT_MILLIS, DEFAULT_TIMEOUT_MILLIS), DEFAULT_TIMEOUT_MILLIS),
        retryCount: normalizeNumber(getPreferenceValue(site, PREFERENCES.RETRY_COUNT, DEFAULT_RETRY_COUNT), DEFAULT_RETRY_COUNT),
        authStrategy: 'bearer'
    };
}

function getRequiredPreferenceIds() {
    return [
        PREFERENCES.ORGANIZATION_ID,
        PREFERENCES.API_ENDPOINT,
        PREFERENCES.API_TOKEN
    ];
}

function validateSettings(settings) {
    var config = settings || getSettings();
    var missing = [];

    if (!config.organizationId) {
        missing.push(PREFERENCES.ORGANIZATION_ID);
    }

    if (!config.apiEndpoint) {
        missing.push(PREFERENCES.API_ENDPOINT);
    }

    if (!config.apiToken) {
        missing.push(PREFERENCES.API_TOKEN);
    }

    return missing;
}

module.exports = {
    PREFERENCES: PREFERENCES,
    getSettings: getSettings,
    getRequiredPreferenceIds: getRequiredPreferenceIds,
    validateSettings: validateSettings
};
