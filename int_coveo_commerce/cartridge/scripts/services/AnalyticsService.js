'use strict';

var Cookie = require('dw/web/Cookie');
var UUIDUtils = require('dw/util/UUIDUtils');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');

var COOKIE_NAME = 'coveo_visitorId';
var COOKIE_MAX_AGE_SECONDS = 63072000;

function getCookies(httpRequest) {
    if (!httpRequest || !httpRequest.getHttpCookies) {
        return null;
    }

    return httpRequest.getHttpCookies();
}

function readCookie(httpRequest, cookieName) {
    var cookies = getCookies(httpRequest);

    if (!cookies) {
        return null;
    }

    if (cookies.getCookie) {
        return cookies.getCookie(cookieName);
    }

    if (cookies[cookieName]) {
        return cookies[cookieName];
    }

    return null;
}

function getCookieValue(httpRequest, cookieName) {
    var cookie = readCookie(httpRequest, cookieName || COOKIE_NAME);

    if (!cookie) {
        return null;
    }

    if (cookie.getValue) {
        return cookie.getValue();
    }

    return cookie.value || null;
}

function persistClientId(httpRequest, httpResponse, clientId) {
    var cookie;

    if (!httpResponse || !httpResponse.addHttpCookie) {
        return clientId;
    }

    cookie = new Cookie(COOKIE_NAME, clientId);
    cookie.setMaxAge(COOKIE_MAX_AGE_SECONDS);
    cookie.setPath('/');
    cookie.setHttpOnly(false);

    if (httpRequest && httpRequest.isHttpSecure && httpRequest.isHttpSecure()) {
        cookie.setSecure(true);
    }

    httpResponse.addHttpCookie(cookie);

    return clientId;
}

function getClientId(httpRequest) {
    if (!Config.getSettings().analyticsEnabled) {
        return null;
    }

    return getCookieValue(httpRequest, COOKIE_NAME);
}

function ensureClientId(httpRequest, httpResponse) {
    var clientId;

    if (!Config.getSettings().analyticsEnabled) {
        return null;
    }

    clientId = getClientId(httpRequest);

    if (clientId) {
        return clientId;
    }

    clientId = UUIDUtils.createUUID();
    persistClientId(httpRequest, httpResponse, clientId);
    Logger.debug('Generated Coveo analytics client ID.', {
        cookieName: COOKIE_NAME
    });

    return clientId;
}

function buildRequestContext(httpRequest, httpResponse, overrides) {
    var config = Config.getSettings();
    var context = overrides || {};

    return {
        clientId: ensureClientId(httpRequest, httpResponse),
        searchHub: context.searchHub || config.searchHub,
        pipeline: context.pipeline || config.pipeline
    };
}

module.exports = {
    COOKIE_NAME: COOKIE_NAME,
    getClientId: getClientId,
    ensureClientId: ensureClientId,
    buildRequestContext: buildRequestContext
};
