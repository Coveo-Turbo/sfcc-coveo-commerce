'use strict';

var SFCCLogger = require('dw/system/Logger');
var Config = require('*/cartridge/scripts/config/Config');

var FILE_NAME = 'CoveoCommerce';
var CATEGORY = 'integration';

function getLogger() {
    return SFCCLogger.getLogger(FILE_NAME, CATEGORY);
}

function serialize(data) {
    if (typeof data === 'undefined') {
        return '';
    }

    try {
        return JSON.stringify(data);
    } catch (error) {
        return String(data);
    }
}

function log(level, message, data) {
    var logger = getLogger();
    var output = message;
    var payload = serialize(data);

    if (payload) {
        output += ' | ' + payload;
    }

    if (level === 'debug') {
        logger.debug('{0}', output);
        return;
    }

    if (level === 'warn') {
        logger.warn('{0}', output);
        return;
    }

    if (level === 'error') {
        logger.error('{0}', output);
        return;
    }

    logger.info('{0}', output);
}

module.exports = {
    debug: function (message, data) {
        if (!Config.getSettings().verboseLogging) {
            return;
        }

        log('debug', message, data);
    },
    info: function (message, data) {
        log('info', message, data);
    },
    warn: function (message, data) {
        log('warn', message, data);
    },
    error: function (message, data) {
        log('error', message, data);
    }
};
