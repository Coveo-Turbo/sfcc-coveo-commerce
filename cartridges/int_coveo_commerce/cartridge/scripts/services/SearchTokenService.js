'use strict';

var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');
var CoveoSearchTokenHttpService = require('*/cartridge/scripts/services/CoveoSearchTokenHttpService');
var TOKEN_CACHE_KEY = 'coveoCommerceSearchTokenCache';
var TOKEN_CACHE_SAFETY_WINDOW_MILLIS = 5000;

function getCurrentCustomer(context) {
    return context && (context.currentCustomer || context.customer) ? (context.currentCustomer || context.customer) : null;
}

function getTokenOptions(context) {
    if (context && context.searchTokenOptions) {
        return context.searchTokenOptions;
    }

    return {};
}

function getSession(context) {
    return context && context.session ? context.session : null;
}

function getPrivacyCache(context) {
    var sessionContainer = getSession(context);

    if (sessionContainer && sessionContainer.privacyCache && sessionContainer.privacyCache.get && sessionContainer.privacyCache.set) {
        return sessionContainer.privacyCache;
    }

    return null;
}

function getPrivacyStore(context) {
    var sessionContainer = getSession(context);

    if (sessionContainer && sessionContainer.privacy) {
        return sessionContainer.privacy;
    }

    return null;
}

function readSfraProfileValue(currentCustomer, propertyName) {
    if (!currentCustomer || !currentCustomer.profile) {
        return null;
    }

    if (currentCustomer.profile[propertyName]) {
        return currentCustomer.profile[propertyName];
    }

    if (currentCustomer.profile.raw && currentCustomer.profile.raw[propertyName]) {
        return currentCustomer.profile.raw[propertyName];
    }

    return null;
}

function readDwCustomerProfileValue(currentCustomer, propertyName) {
    var profile;
    var methodName = 'get' + propertyName.charAt(0).toUpperCase() + propertyName.slice(1);

    if (!currentCustomer) {
        return null;
    }

    if (currentCustomer.getProfile) {
        profile = currentCustomer.getProfile();

        if (profile) {
            if (profile[methodName]) {
                return profile[methodName]();
            }

            if (profile[propertyName]) {
                return profile[propertyName];
            }
        }
    }

    return null;
}

function resolveUserId(context) {
    var tokenOptions = getTokenOptions(context);
    var currentCustomer = getCurrentCustomer(context);
    var explicitUserId = tokenOptions.userId || tokenOptions.userName || context.userId || context.userName;

    if (explicitUserId) {
        return explicitUserId;
    }

    return readSfraProfileValue(currentCustomer, 'email') ||
        readSfraProfileValue(currentCustomer, 'customerNo') ||
        readDwCustomerProfileValue(currentCustomer, 'email') ||
        readDwCustomerProfileValue(currentCustomer, 'customerNo') ||
        null;
}

function resolveDisplayName(context) {
    var tokenOptions = getTokenOptions(context);
    var currentCustomer = getCurrentCustomer(context);
    var explicitDisplayName = tokenOptions.userDisplayName || context.userDisplayName;
    var firstName;
    var lastName;

    if (explicitDisplayName) {
        return explicitDisplayName;
    }

    firstName = readSfraProfileValue(currentCustomer, 'firstName') || readDwCustomerProfileValue(currentCustomer, 'firstName') || '';
    lastName = readSfraProfileValue(currentCustomer, 'lastName') || readDwCustomerProfileValue(currentCustomer, 'lastName') || '';

    return (firstName + ' ' + lastName).replace(/^\s+|\s+$/g, '');
}

function normalizeStringArray(values) {
    if (!values) {
        return [];
    }

    if (Object.prototype.toString.call(values) === '[object Array]') {
        return values.filter(function (value) {
            return !!value;
        });
    }

    return [values];
}

function stableSerialize(value) {
    var keys;

    if (value === null || typeof value === 'undefined') {
        return 'null';
    }

    if (Object.prototype.toString.call(value) === '[object Array]') {
        return '[' + value.map(stableSerialize).join(',') + ']';
    }

    if (typeof value === 'object') {
        keys = Object.keys(value).sort();

        return '{' + keys.map(function (key) {
            return JSON.stringify(key) + ':' + stableSerialize(value[key]);
        }).join(',') + '}';
    }

    return JSON.stringify(value);
}

function parseCacheValue(value) {
    if (!value) {
        return {};
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return {};
    }
}

function readCacheStore(context) {
    var privacyCache = getPrivacyCache(context);
    var privacyStore = getPrivacyStore(context);

    if (privacyCache) {
        return parseCacheValue(privacyCache.get(TOKEN_CACHE_KEY));
    }

    if (privacyStore && privacyStore[TOKEN_CACHE_KEY]) {
        return parseCacheValue(privacyStore[TOKEN_CACHE_KEY]);
    }

    return {};
}

function writeCacheStore(context, value) {
    var serialized = JSON.stringify(value || {});
    var privacyCache = getPrivacyCache(context);
    var privacyStore = getPrivacyStore(context);

    if (privacyCache) {
        privacyCache.set(TOKEN_CACHE_KEY, serialized);
        return;
    }

    if (privacyStore) {
        privacyStore[TOKEN_CACHE_KEY] = serialized;
    }
}

function cleanExpiredCacheEntries(store, now) {
    var cleaned = {};

    Object.keys(store || {}).forEach(function (key) {
        var entry = store[key];

        if (!entry || !entry.token || !entry.expiresAt || entry.expiresAt <= now) {
            return;
        }

        cleaned[key] = entry;
    });

    return cleaned;
}

function buildCacheKey(endpoint, payload) {
    return endpoint + '::' + stableSerialize(payload);
}

function getCacheDurationMillis(validFor) {
    var duration = parseInt(validFor, 10);

    if (isNaN(duration) || duration <= 0) {
        return 0;
    }

    if (duration <= TOKEN_CACHE_SAFETY_WINDOW_MILLIS) {
        return Math.max(duration - 250, 0);
    }

    return duration - TOKEN_CACHE_SAFETY_WINDOW_MILLIS;
}

function readCachedToken(context, cacheKey) {
    var now = new Date().getTime();
    var store = cleanExpiredCacheEntries(readCacheStore(context), now);
    var entry = store[cacheKey];

    writeCacheStore(context, store);

    if (!entry) {
        return '';
    }

    return entry.token || '';
}

function cacheToken(context, cacheKey, token, validFor) {
    var cacheDuration = getCacheDurationMillis(validFor);
    var now = new Date().getTime();
    var store;

    if (!cacheDuration || !token) {
        return;
    }

    store = cleanExpiredCacheEntries(readCacheStore(context), now);
    store[cacheKey] = {
        token: token,
        expiresAt: now + cacheDuration
    };
    writeCacheStore(context, store);
}

function buildUserIds(context, settings) {
    var tokenOptions = getTokenOptions(context);
    var explicitUserIds = tokenOptions.userIds || context.userIds;
    var userId;

    if (explicitUserIds && explicitUserIds.length) {
        return explicitUserIds;
    }

    userId = resolveUserId(context);

    if (!userId) {
        throw new Error('Unable to generate a Coveo search token without an authenticated user identity.');
    }

    return [{
        name: userId,
        provider: tokenOptions.securityProvider || context.securityProvider || settings.searchTokenSecurityProvider,
        type: tokenOptions.userType || context.userType || settings.searchTokenUserType
    }];
}

function buildTokenRequestBody(context, settings) {
    var tokenOptions = getTokenOptions(context);
    var body = {
        userIds: buildUserIds(context, settings),
        validFor: tokenOptions.validFor || context.validFor || settings.searchTokenValidityMillis
    };
    var userGroups = normalizeStringArray(tokenOptions.userGroups || context.userGroups);
    var userDisplayName = resolveDisplayName(context);
    var filter = tokenOptions.filter || context.filter;
    var allowedDictionaryFieldKeys = tokenOptions.allowedDictionaryFieldKeys || context.allowedDictionaryFieldKeys;

    if (userDisplayName) {
        body.userDisplayName = userDisplayName;
    }

    if (userGroups.length) {
        body.userGroups = userGroups;
    }

    if (filter) {
        body.filter = filter;
    }

    if (allowedDictionaryFieldKeys) {
        body.allowedDictionaryFieldKeys = allowedDictionaryFieldKeys;
    }

    return body;
}

function extractToken(rawResponse) {
    var responseText = String(rawResponse || '').replace(/^\s+|\s+$/g, '');
    var parsed;

    if (!responseText) {
        throw new Error('Coveo search token service returned an empty response.');
    }

    if (responseText.charAt(0) === '{') {
        parsed = JSON.parse(responseText);

        return parsed.token || parsed.searchToken || parsed.accessToken || '';
    }

    return responseText;
}

function requestSearchToken(context, settings) {
    var config = settings || Config.getSettings();
    var payload = buildTokenRequestBody(context || {}, config);
    var cacheScope = config.organizationId || Config.SERVICE_IDS.SEARCH_TOKEN;
    var cacheKey = buildCacheKey(cacheScope, payload);
    var cachedToken = readCachedToken(context, cacheKey);
    var response;
    var responseText;
    var token;

    if (cachedToken) {
        Logger.debug('Reusing cached Coveo search token.', {
            organizationId: config.organizationId,
            serviceId: Config.SERVICE_IDS.SEARCH_TOKEN
        });

        return cachedToken;
    }

    try {
        response = CoveoSearchTokenHttpService.request(payload, config);
    } catch (error) {
        Logger.error('Coveo search token request failed.', {
            organizationId: config.organizationId,
            serviceId: Config.SERVICE_IDS.SEARCH_TOKEN,
            message: error.message,
            statusCode: error.statusCode || null,
            serviceStatus: error.serviceStatus || null,
            unavailableReason: error.unavailableReason || null
        });

        throw error;
    }

    responseText = response.body;

    if (response.statusCode < 200 || response.statusCode >= 300) {
        Logger.error('Coveo search token request failed.', {
            organizationId: config.organizationId,
            serviceId: Config.SERVICE_IDS.SEARCH_TOKEN,
            statusCode: response.statusCode
        });

        throw new Error('Unable to retrieve a Coveo search token. Status: ' + response.statusCode + '.');
    }

    token = extractToken(responseText);

    if (!token) {
        throw new Error('Coveo search token service did not return a token value.');
    }

    cacheToken(context, cacheKey, token, payload.validFor);

    Logger.info('Coveo search token generated.', {
        organizationId: config.organizationId,
        serviceId: Config.SERVICE_IDS.SEARCH_TOKEN,
        validFor: payload.validFor
    });

    return token;
}

module.exports = {
    requestSearchToken: requestSearchToken,
    buildTokenRequestBody: buildTokenRequestBody
};
