'use strict';

var SFCCHttpClient = require('dw/net/HTTPClient');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');

function getCurrentCustomer(context) {
    if (context && context.currentCustomer) {
        return context.currentCustomer;
    }

    if (context && context.customer) {
        return context.customer;
    }

    if (typeof customer !== 'undefined') {
        return customer;
    }

    return null;
}

function getTokenOptions(context) {
    if (context && context.searchTokenOptions) {
        return context.searchTokenOptions;
    }

    return {};
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

function getSearchTokenEndpoint(settings) {
    if (settings.searchTokenServiceUrl) {
        return settings.searchTokenServiceUrl;
    }

    return 'https://' + settings.organizationId + '.org.coveo.com/rest/search/token';
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

function getStatusCode(httpClient) {
    if (httpClient.getStatusCode) {
        return httpClient.getStatusCode();
    }

    return httpClient.statusCode;
}

function getText(httpClient) {
    if (httpClient.getText) {
        return httpClient.getText();
    }

    return httpClient.text;
}

function requestSearchToken(context, settings) {
    var config = settings || Config.getSettings();
    var endpoint = getSearchTokenEndpoint(config);
    var payload = buildTokenRequestBody(context || {}, config);
    var httpClient = new SFCCHttpClient();
    var responseText;
    var statusCode;
    var token;

    httpClient.open('POST', endpoint);
    httpClient.setTimeout(config.timeoutMillis);
    httpClient.setRequestHeader('Authorization', 'Bearer ' + config.authenticatedSearchApiKey);
    httpClient.setRequestHeader('Accept', 'text/plain, application/json');
    httpClient.setRequestHeader('Content-Type', 'application/json');
    httpClient.send(JSON.stringify(payload));

    statusCode = getStatusCode(httpClient);
    responseText = getText(httpClient);

    if (statusCode < 200 || statusCode >= 300) {
        Logger.error('Coveo search token request failed.', {
            statusCode: statusCode,
            endpoint: endpoint
        });

        throw new Error('Unable to retrieve a Coveo search token. Status: ' + statusCode + '.');
    }

    token = extractToken(responseText);

    if (!token) {
        throw new Error('Coveo search token service did not return a token value.');
    }

    Logger.info('Coveo search token generated.', {
        endpoint: endpoint,
        validFor: payload.validFor
    });

    return token;
}

module.exports = {
    requestSearchToken: requestSearchToken,
    buildTokenRequestBody: buildTokenRequestBody
};
