'use strict';

var Cookie = require('dw/web/Cookie');
var UUIDUtils = require('dw/util/UUIDUtils');
var Config = require('*/cartridge/scripts/config/Config');
var Logger = require('*/cartridge/scripts/helpers/Logger');

var COOKIE_NAME = 'coveo_visitorId';
var COOKIE_MAX_AGE_SECONDS = 63072000;
var SESSION_KEY = 'coveoVisitorId';

// SFCC evaluates script modules per request, so this memo is request-scoped.
// It is additionally keyed by request ID to stay correct if a module instance
// is ever reused across requests.
var requestMemo = {
    requestId: null,
    clientId: null
};

function getRequestId(httpRequest) {
    if (!httpRequest) {
        return '';
    }

    if (httpRequest.requestID) {
        return String(httpRequest.requestID);
    }

    if (httpRequest.getRequestID) {
        return String(httpRequest.getRequestID());
    }

    return '';
}

function readMemoClientId(httpRequest) {
    if (!requestMemo.clientId) {
        return null;
    }

    if (requestMemo.requestId !== getRequestId(httpRequest)) {
        return null;
    }

    return requestMemo.clientId;
}

function writeMemoClientId(httpRequest, clientId) {
    requestMemo = {
        requestId: getRequestId(httpRequest),
        clientId: clientId
    };
}

function getSessionPrivacy(httpRequest) {
    var currentSession = httpRequest && httpRequest.session ? httpRequest.session : null;

    if (currentSession && currentSession.privacy) {
        return currentSession.privacy;
    }

    return null;
}

function readSessionClientId(httpRequest) {
    var privacy = getSessionPrivacy(httpRequest);

    if (privacy && privacy[SESSION_KEY]) {
        return String(privacy[SESSION_KEY]);
    }

    return null;
}

function writeSessionClientId(httpRequest, clientId) {
    var privacy = getSessionPrivacy(httpRequest);

    if (privacy) {
        privacy[SESSION_KEY] = clientId;
    }
}

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
        writeMemoClientId(httpRequest, clientId);
        writeSessionClientId(httpRequest, clientId);

        return clientId;
    }

    // A cookie added to the response is not readable from the current request.
    // Reuse the ID already created during this request so a second call cannot
    // replace the visitor cookie with a different value.
    clientId = readMemoClientId(httpRequest);

    if (clientId) {
        return clientId;
    }

    // Concurrent first-visit requests share the storefront session, so a
    // session-held ID keeps them on one identity.
    clientId = readSessionClientId(httpRequest) || UUIDUtils.createUUID();
    persistClientId(httpRequest, httpResponse, clientId);
    writeMemoClientId(httpRequest, clientId);
    writeSessionClientId(httpRequest, clientId);
    Logger.debug('Generated Coveo analytics client ID.', {
        cookieName: COOKIE_NAME
    });

    return clientId;
}

function buildRequestContext(httpRequest, httpResponse, overrides) {
    var config = Config.getSettings();
    var context = overrides && typeof overrides === 'object' ? overrides : {};
    var clientId;

    if (!config.analyticsEnabled) {
        return {
            clientId: null,
            searchHub: context.searchHub || config.searchHub,
            pipeline: context.pipeline || config.pipeline
        };
    }

    clientId = context.clientId || ensureClientId(httpRequest, httpResponse);

    // Reuse the supplied object as request-scoped state. This prevents a
    // second identity lookup from replacing a cookie generated earlier in
    // the same server request before that cookie is visible to the browser.
    context.clientId = clientId;

    return {
        clientId: clientId,
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
