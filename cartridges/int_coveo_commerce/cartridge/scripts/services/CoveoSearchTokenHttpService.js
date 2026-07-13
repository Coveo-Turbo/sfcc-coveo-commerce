'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Config = require('*/cartridge/scripts/config/Config');
var ServiceSupport = require('*/cartridge/scripts/services/CoveoServiceSupport');
var UrlHelper = require('*/cartridge/scripts/helpers/UrlHelper');

function getServiceUrl(service, settings) {
    var config = settings || {};
    var configuredUrl = ServiceSupport.getCredentialURL(service) || config.searchTokenServiceUrl;

    if (configuredUrl) {
        if (configuredUrl.indexOf('/rest/search/token') !== -1) {
            return configuredUrl;
        }

        return UrlHelper.buildEndpoint(configuredUrl, 'rest/search/token');
    }

    return 'https://' + config.organizationId + '.org.coveo.com/rest/search/token';
}

function getPrivateApiKey(service, settings) {
    return ServiceSupport.getCredentialPassword(service) || (settings && settings.authenticatedSearchApiKey) || '';
}

function createService() {
    return LocalServiceRegistry.createService(Config.SERVICE_IDS.SEARCH_TOKEN, {
        createRequest: function (service, requestData) {
            var data = requestData || {};
            var settings = data.settings || {};
            var privateApiKey = getPrivateApiKey(service, settings);

            if (!privateApiKey) {
                throw new Error('Missing authenticated search API key on the search-token service credential.');
            }

            service.setAuthentication('NONE');
            service.setRequestMethod('POST');
            service.setURL(getServiceUrl(service, settings));
            service.setEncoding('UTF-8');
            service.addHeader('Accept', 'text/plain, application/json');
            service.addHeader('Content-Type', 'application/json');
            service.addHeader('Authorization', 'Bearer ' + privateApiKey);

            return ServiceSupport.normalizeBody(data.payload);
        },
        parseResponse: function (service, httpClient) {
            return ServiceSupport.buildResponseFromClient(httpClient, 0);
        },
        getRequestLogMessage: function () {
            return 'POST ' + Config.SERVICE_IDS.SEARCH_TOKEN;
        },
        getResponseLogMessage: function (responseData) {
            return ServiceSupport.buildStatusLogMessage(responseData);
        },
        filterLogMessage: function (message) {
            return ServiceSupport.filterLogMessage(message);
        },
        mockCall: function () {
            return {
                statusCode: 200,
                statusMessage: 'Success',
                text: JSON.stringify({
                    token: 'mock-search-token'
                })
            };
        }
    });
}

function request(payload, settings) {
    var config = settings || Config.getSettings();
    var service = createService();
    var startedAt = ServiceSupport.getNow();
    var result = service.call({
        payload: payload,
        settings: config
    });

    return ServiceSupport.createServiceResult(
        Config.SERVICE_IDS.SEARCH_TOKEN,
        'searchToken',
        result,
        service,
        startedAt
    );
}

module.exports = {
    request: request
};
