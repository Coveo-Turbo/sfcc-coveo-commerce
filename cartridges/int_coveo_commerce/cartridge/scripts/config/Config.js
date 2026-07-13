'use strict';

var Site = require('dw/system/Site');

var DEFAULT_RETRY_COUNT = 1;
var DEFAULT_SEARCH_TOKEN_VALIDITY_MILLIS = 3600000;
var DEFAULT_SEARCH_TOKEN_SECURITY_PROVIDER = 'Email Security Provider';

var AUTH_MODES = {
    API_KEY: 'apiKey',
    SEARCH_TOKEN: 'searchToken'
};

var SERVICE_IDS = {
    COMMERCE_API: 'coveo.http.commerce.api',
    SEARCH_TOKEN: 'coveo.http.search.token'
};

var PREFERENCES = {
    ORGANIZATION_ID: 'coveoCommerceOrganizationId',
    TRACKING_ID: 'coveoCommerceTrackingId',
    AUTH_MODE: 'coveoCommerceAuthMode',
    SEARCH_TOKEN_SECURITY_PROVIDER: 'coveoCommerceSearchTokenSecurityProvider',
    SEARCH_TOKEN_USER_TYPE: 'coveoCommerceSearchTokenUserType',
    SEARCH_TOKEN_VALIDITY_MILLIS: 'coveoCommerceSearchTokenValidityMillis',
    LOCALE: 'coveoCommerceLocale',
    LANGUAGE: 'coveoCommerceLanguage',
    COUNTRY: 'coveoCommerceCountry',
    CURRENCY: 'coveoCommerceCurrency',
    SEARCH_HUB: 'coveoCommerceSearchHub',
    PIPELINE: 'coveoCommercePipeline',
    ANALYTICS_ENABLED: 'coveoCommerceAnalyticsEnabled',
    VERBOSE_LOGGING: 'coveoCommerceVerboseLogging',
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

function normalizeAuthMode(value) {
    if (value === AUTH_MODES.SEARCH_TOKEN) {
        return AUTH_MODES.SEARCH_TOKEN;
    }

    return AUTH_MODES.API_KEY;
}

function parseLocale(value) {
    var source = String(value || '').replace('_', '-').split('-');
    var language = source[0] && /^[A-Za-z]{2,3}$/.test(source[0]) ? String(source[0]).toLowerCase() : '';
    var country = source[1] && /^[A-Za-z]{2}$/.test(source[1]) ? String(source[1]).toUpperCase() : '';

    return {
        language: language,
        country: country
    };
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
    var locale = getPreferenceValue(site, PREFERENCES.LOCALE, '');
    var parsedLocale = parseLocale(locale);

    return {
        organizationId: getPreferenceValue(site, PREFERENCES.ORGANIZATION_ID, ''),
        trackingId: getPreferenceValue(site, PREFERENCES.TRACKING_ID, ''),
        authMode: normalizeAuthMode(getPreferenceValue(site, PREFERENCES.AUTH_MODE, AUTH_MODES.API_KEY)),
        searchTokenSecurityProvider: getPreferenceValue(
            site,
            PREFERENCES.SEARCH_TOKEN_SECURITY_PROVIDER,
            DEFAULT_SEARCH_TOKEN_SECURITY_PROVIDER
        ),
        searchTokenUserType: getPreferenceValue(site, PREFERENCES.SEARCH_TOKEN_USER_TYPE, 'User'),
        searchTokenValidityMillis: normalizeNumber(
            getPreferenceValue(site, PREFERENCES.SEARCH_TOKEN_VALIDITY_MILLIS, DEFAULT_SEARCH_TOKEN_VALIDITY_MILLIS),
            DEFAULT_SEARCH_TOKEN_VALIDITY_MILLIS
        ),
        locale: locale,
        language: getPreferenceValue(site, PREFERENCES.LANGUAGE, parsedLocale.language),
        country: getPreferenceValue(site, PREFERENCES.COUNTRY, parsedLocale.country),
        currency: getPreferenceValue(site, PREFERENCES.CURRENCY, ''),
        searchHub: getPreferenceValue(site, PREFERENCES.SEARCH_HUB, ''),
        pipeline: getPreferenceValue(site, PREFERENCES.PIPELINE, ''),
        analyticsEnabled: normalizeBoolean(getPreferenceValue(site, PREFERENCES.ANALYTICS_ENABLED, true), true),
        verboseLogging: normalizeBoolean(getPreferenceValue(site, PREFERENCES.VERBOSE_LOGGING, false), false),
        retryCount: normalizeNumber(getPreferenceValue(site, PREFERENCES.RETRY_COUNT, DEFAULT_RETRY_COUNT), DEFAULT_RETRY_COUNT)
    };
}

function validateSettings(settings) {
    var config = settings || getSettings();
    var missing = [];

    if (!config.organizationId) {
        missing.push(PREFERENCES.ORGANIZATION_ID);
    }

    if (!config.trackingId) {
        missing.push(PREFERENCES.TRACKING_ID);
    }

    return missing;
}

module.exports = {
    AUTH_MODES: AUTH_MODES,
    SERVICE_IDS: SERVICE_IDS,
    PREFERENCES: PREFERENCES,
    getSettings: getSettings,
    validateSettings: validateSettings
};
