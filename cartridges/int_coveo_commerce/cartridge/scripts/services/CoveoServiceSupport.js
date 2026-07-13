'use strict';

function getNow() {
    return new Date().getTime();
}

function sanitizeLogValue(value, maxLength) {
    return String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^\s+|\s+$/g, '')
        .slice(0, maxLength || 1024);
}

function redactSensitiveData(value) {
    return String(value || '')
        .replace(/(Authorization["']?\s*[:=]\s*["']?Bearer\s+)[^"',\s]+/ig, '$1[REDACTED]')
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1[REDACTED]')
        .replace(/("?(?:token|accessToken|searchToken|secret)"?\s*:\s*")[^"]+/ig, '$1[REDACTED]');
}

function filterLogMessage(message) {
    return sanitizeLogValue(redactSensitiveData(message), 2048);
}

function getStatusCode(httpClient) {
    if (!httpClient) {
        return 0;
    }

    if (httpClient.getStatusCode) {
        return httpClient.getStatusCode();
    }

    return httpClient.statusCode || 0;
}

function getText(httpClient) {
    if (!httpClient) {
        return '';
    }

    if (httpClient.getText) {
        return httpClient.getText();
    }

    return httpClient.text || '';
}

function getHeaders(httpClient) {
    if (!httpClient || !httpClient.getAllResponseHeaders) {
        return {};
    }

    return httpClient.getAllResponseHeaders();
}

function buildResponseFromClient(httpClient, duration) {
    var statusCode = getStatusCode(httpClient);
    var body = getText(httpClient);
    var headers = getHeaders(httpClient);

    if (!statusCode && !body && !Object.keys(headers).length) {
        return null;
    }

    return {
        statusCode: statusCode,
        ok: statusCode >= 200 && statusCode < 300,
        body: body,
        headers: headers,
        duration: duration
    };
}

function getResultValue(result, methodName, propertyName, fallback) {
    if (!result) {
        return fallback;
    }

    if (result[methodName]) {
        return result[methodName]();
    }

    if (typeof result[propertyName] !== 'undefined') {
        return result[propertyName];
    }

    return fallback;
}

function isResultOk(result) {
    return getResultValue(result, 'isOk', 'ok', false) === true;
}

function getResultObject(result) {
    return getResultValue(result, 'getObject', 'object', null);
}

function getResultStatus(result) {
    return getResultValue(result, 'getStatus', 'status', '');
}

function getResultError(result) {
    return getResultValue(result, 'getError', 'error', null);
}

function getResultErrorMessage(result) {
    return getResultValue(result, 'getErrorMessage', 'errorMessage', '');
}

function getUnavailableReason(result) {
    return getResultValue(result, 'getUnavailableReason', 'unavailableReason', '');
}

function isRetryableFailure(statusCode, unavailableReason) {
    if (statusCode === 429 || statusCode >= 500) {
        return true;
    }

    return unavailableReason === 'TIMEOUT' || unavailableReason === 'RATE_LIMITED';
}

function createServiceError(serviceId, operationName, result, response) {
    var status = getResultStatus(result);
    var unavailableReason = getUnavailableReason(result);
    var statusCode = response && response.statusCode ? response.statusCode : getResultError(result);
    var errorMessage = getResultErrorMessage(result);
    var messageParts = [
        'Coveo service call failed for ' + operationName + ' using ' + serviceId + '.'
    ];
    var error = new Error('');

    if (status) {
        messageParts.push('Status: ' + status + '.');
    }

    if (statusCode) {
        messageParts.push('Code: ' + statusCode + '.');
    }

    if (unavailableReason) {
        messageParts.push('Reason: ' + unavailableReason + '.');
    }

    if (errorMessage) {
        messageParts.push(errorMessage);
    }

    error.message = messageParts.join(' ');
    error.name = 'CoveoCommerceServiceError';
    error.serviceId = serviceId;
    error.serviceStatus = status || null;
    error.statusCode = statusCode || null;
    error.unavailableReason = unavailableReason || null;
    error.response = response || null;
    error.retryable = isRetryableFailure(statusCode, unavailableReason);

    return error;
}

function createServiceResult(serviceId, operationName, result, service, startedAt) {
    var duration = getNow() - startedAt;
    var response = getResultObject(result) || buildResponseFromClient(service && service.getClient ? service.getClient() : null, duration);

    if (response) {
        response.duration = duration;

        if (typeof response.ok !== 'boolean' && typeof response.statusCode === 'number') {
            response.ok = response.statusCode >= 200 && response.statusCode < 300;
        }
    }

    if (response && response.statusCode) {
        return response;
    }

    if (isResultOk(result) && response) {
        return response;
    }

    throw createServiceError(serviceId, operationName, result, response);
}

function normalizeBody(body) {
    if (body === null || typeof body === 'undefined') {
        return null;
    }

    if (typeof body === 'string') {
        return body;
    }

    return JSON.stringify(body);
}

function getCredential(service) {
    var configuration;

    if (!service || !service.getConfiguration) {
        return null;
    }

    configuration = service.getConfiguration();

    if (!configuration || !configuration.getCredential) {
        return null;
    }

    return configuration.getCredential();
}

function getCredentialPassword(service) {
    var credential = getCredential(service);

    if (!credential) {
        return '';
    }

    if (credential.getPassword) {
        return credential.getPassword();
    }

    return credential.password || '';
}

function getCredentialURL(service) {
    var credential = getCredential(service);

    if (!credential) {
        return '';
    }

    if (credential.getURL) {
        return credential.getURL();
    }

    return credential.URL || credential.url || '';
}

function buildStatusLogMessage(responseData) {
    var data = responseData || {};

    return sanitizeLogValue('status=' + (data.statusCode || 0), 256);
}

module.exports = {
    buildResponseFromClient: buildResponseFromClient,
    buildStatusLogMessage: buildStatusLogMessage,
    createServiceResult: createServiceResult,
    filterLogMessage: filterLogMessage,
    getCredentialPassword: getCredentialPassword,
    getCredentialURL: getCredentialURL,
    getNow: getNow,
    normalizeBody: normalizeBody,
    sanitizeLogValue: sanitizeLogValue
};
