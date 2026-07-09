(function ($, window, document) {
    'use strict';

    var RECENT_SEARCHES_KEY = 'mondouCoveoRecentSearches';
    var MAX_RECENT_SEARCHES = 5;
    var DEBOUNCE_DELAY = 250;
    var BOOTSTRAP_CACHE_TTL = 120000;
    var QUERY_SUGGEST_CACHE_TTL = 30000;
    var PRODUCT_PREVIEW_CACHE_TTL = 30000;
    var DOWN_KEY = 40;
    var UP_KEY = 38;
    var ENTER_KEY = 13;
    var REQUEST_TYPES = {
        BOOTSTRAP: 'bootstrap',
        SUGGEST: 'suggest',
        PREVIEW: 'preview'
    };
    var bootstrapCache = {};
    var suggestCache = {};
    var previewCache = {};

    function normalizeString(value) {
        return $.trim(String(value || ''));
    }

    function debounce(fn, wait) {
        var timeoutId = null;

        return function () {
            var context = this;
            var args = arguments;

            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(function () {
                fn.apply(context, args);
            }, wait);
        };
    }

    function getNow() {
        return new Date().getTime();
    }

    function buildCacheKey(url, query) {
        return String(url || '') + '::' + String(query || '');
    }

    function readCache(cache, key, ttl) {
        var entry = cache[key];

        if (!entry) {
            return null;
        }

        if ((getNow() - entry.cachedAt) > ttl) {
            delete cache[key];
            return null;
        }

        return entry.payload;
    }

    function writeCache(cache, key, payload) {
        cache[key] = {
            cachedAt: getNow(),
            payload: payload || {}
        };

        return cache[key].payload;
    }

    function getPendingRequests(scope) {
        return $(scope).data('coveoPendingRequests') || {};
    }

    function setPendingRequests(scope, requests) {
        $(scope).data('coveoPendingRequests', requests);
    }

    function abortPendingRequest(scope, requestName) {
        var requests = getPendingRequests(scope);
        var xhr = requests[requestName];

        if (xhr && xhr.readyState !== 4 && xhr.abort) {
            xhr.abort();
        }

        delete requests[requestName];
        setPendingRequests(scope, requests);
    }

    function abortPendingRequests(scope, requestNames) {
        requestNames.forEach(function (requestName) {
            abortPendingRequest(scope, requestName);
        });
    }

    function trackPendingRequest(scope, requestName, xhr) {
        var requests = getPendingRequests(scope);

        abortPendingRequest(scope, requestName);
        requests = getPendingRequests(scope);
        requests[requestName] = xhr;
        setPendingRequests(scope, requests);

        return xhr;
    }

    function releasePendingRequest(scope, requestName, xhr) {
        var requests = getPendingRequests(scope);

        if (requests[requestName] === xhr) {
            delete requests[requestName];
            setPendingRequests(scope, requests);
        }
    }

    function clearTypedState(scope) {
        $(scope).removeData('coveoTypedState');
    }

    function setTypedState(scope, state) {
        $(scope).data('coveoTypedState', state);
        return state;
    }

    function getTypedState(scope, requestId, query) {
        var state = $(scope).data('coveoTypedState');

        if (!state) {
            return null;
        }

        if (String(state.requestId) !== String(requestId) || state.query !== query) {
            return null;
        }

        return state;
    }

    function updateTypedState(scope, requestId, query, patch) {
        var state = getTypedState(scope, requestId, query);

        if (!state) {
            return null;
        }

        Object.keys(patch || {}).forEach(function (key) {
            state[key] = patch[key];
        });

        return setTypedState(scope, state);
    }

    function renderStoredTypedState(scope, requestId, query) {
        var state = getTypedState(scope, requestId, query);

        if (!state) {
            return;
        }

        renderTypedState(scope, state.suggestions || [], state.products || []);
    }

    function getWrapper(scope) {
        return $(scope).siblings('.suggestions-wrapper[data-coveo-search-box="true"]').first();
    }

    function getForm(scope) {
        return $(scope).closest('form[name="simpleSearch"]');
    }

    function isMobileSearch(scope) {
        return !!$(scope).closest('.search-mobile').length;
    }

    function readData($wrapper, name, fallback) {
        var value = $wrapper.data(name);

        if (typeof value === 'undefined' || value === null || value === '') {
            return fallback;
        }

        return value;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function clearModals() {
        $('body').removeClass('modal-open');
        $('header').siblings().attr('aria-hidden', 'false');
        $('.suggestions').removeClass('modal');
    }

    function applyModals(scope) {
        if (!isMobileSearch(scope)) {
            return;
        }

        $('body').addClass('modal-open');
        $('header').siblings().attr('aria-hidden', 'true');
        getWrapper(scope).find('.suggestions').addClass('modal');
    }

    function positionSuggestions(scope) {
        var $scope;
        var $suggestions;
        var top;
        var topHeight;

        if (!isMobileSearch(scope)) {
            return;
        }

        $scope = $(scope);
        top = $scope.offset().top;
        topHeight = top + $scope.outerHeight();
        $suggestions = getWrapper(scope).find('.suggestions');
        $suggestions.css('top', topHeight);
        $suggestions.css('height', 'calc(100% - ' + topHeight + 'px)');
    }

    function setExpanded(scope, expanded) {
        $(scope).attr('aria-expanded', expanded ? 'true' : 'false');

        if (!expanded) {
            $(scope).attr('aria-activedescendant', '');
        }
    }

    function getDebugParams() {
        var search = String(window.location.search || '').replace(/^\?/, '');
        var debug = null;

        search.split('&').forEach(function (pair) {
            var parts;
            var key;

            if (!pair || debug !== null) {
                return;
            }

            parts = pair.split('=');
            key = window.decodeURIComponent(parts[0] || '');

            if (key !== 'coveoDebug') {
                return;
            }

            debug = window.decodeURIComponent(parts[1] || '');
        });

        if (debug === '1' || debug === 'true') {
            return {
                coveoDebug: '1'
            };
        }

        return {};
    }

    function buildSearchUrl(scope, query) {
        var action = getForm(scope).attr('action') || window.location.pathname;
        var separator = action.indexOf('?') === -1 ? '?' : '&';

        return action + separator + 'q=' + window.encodeURIComponent(query);
    }

    function readRecentSearches() {
        var rawValue;
        var parsed;

        try {
            rawValue = window.localStorage.getItem(RECENT_SEARCHES_KEY);
            parsed = rawValue ? JSON.parse(rawValue) : [];
        } catch (error) {
            parsed = [];
        }

        if (!$.isArray(parsed)) {
            return [];
        }

        return parsed.filter(function (entry) {
            return !!entry;
        });
    }

    function saveRecentSearch(query) {
        var normalized = normalizeString(query);
        var entries;

        if (!normalized) {
            return;
        }

        entries = readRecentSearches().filter(function (entry) {
            return entry !== normalized;
        });
        entries.unshift(normalized);
        entries = entries.slice(0, MAX_RECENT_SEARCHES);

        try {
            window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(entries));
        } catch (error) {
            return;
        }
    }

    function mapRecentSearches(scope) {
        return readRecentSearches().map(function (query) {
            return {
                value: query,
                url: buildSearchUrl(scope, query)
            };
        });
    }

    function renderCountMessage($wrapper, total) {
        var template = readData($wrapper, 'resultCountTemplate', '');

        if (!template) {
            return '';
        }

        return escapeHtml(String(template).replace('{0}', total));
    }

    function renderQuerySection(title, items, baseId) {
        var markup = '';

        if (!items.length) {
            return '';
        }

        markup += '<li class="row justify-content-start header pl-3"><div class="col-xs-12">' + escapeHtml(title) + '</div></li>';
        markup += '<li class="row items">';

        items.forEach(function (item, index) {
            markup += '<div class="col-12 item" id="' + baseId + '-' + index + '" role="option">';
            markup += '<div class="row"><div class="col-xs-12 pl-3 name">';
            markup += '<a href="' + escapeHtml(item.url) + '" data-search-query="' + escapeHtml(item.value) + '"';

            if (item.previewQuery) {
                markup += ' data-preview-query="' + escapeHtml(item.previewQuery) + '"';
            }

            markup += '>' + escapeHtml(item.value) + '</a>';
            markup += '</div></div></div>';
        });

        markup += '</li>';

        return markup;
    }

    function renderProductsSection(title, items, baseId) {
        var markup = '';

        if (!items.length) {
            return '';
        }

        markup += '<li class="row justify-content-start header pl-3"><div class="col-xs-12">' + escapeHtml(title) + '</div></li>';
        markup += '<li class="row justify-content-start items image-items pl-3">';

        items.forEach(function (item, index) {
            markup += '<span class="col-12 item" id="' + baseId + '-' + index + '" role="option">';
            markup += '<div class="suggestions-item">';
            markup += '<a href="' + escapeHtml(item.url) + '" aria-label="' + escapeHtml(item.name) + '">';

            if (item.image) {
                markup += '<img class="swatch-circle hidden-xs-down" alt="' + escapeHtml(item.name) + '" src="' + escapeHtml(item.image) + '" />';
            }

            markup += '<span class="name">' + escapeHtml(item.name) + '</span>';

            if (item.brand) {
                markup += '<span class="category-parent"> ' + escapeHtml(item.brand) + '</span>';
            }

            if (item.price !== null && typeof item.price !== 'undefined' && item.price !== '') {
                markup += '<span class="price d-block">' + escapeHtml(item.price) + '</span>';
            }

            markup += '</a></div></span>';
        });

        markup += '</li>';

        return markup;
    }

    function renderSuggestions(scope, sections) {
        var $wrapper = getWrapper(scope);
        var total = 0;
        var markup = '';

        sections.forEach(function (section) {
            total += section.items.length;
            markup += section.renderer(section.title, section.items, section.baseId);
        });

        if (!total) {
            $wrapper.empty().hide();
            setExpanded(scope, false);
            clearModals();
            return;
        }

        markup = '<div class="suggestions"><ul class="container search-results gtm-click" role="listbox" id="search-results">' +
            markup +
            '<li class="d-sm-none more-below"><i class="fa fa-long-arrow-down" aria-hidden="true"></i></li>' +
            '</ul>' +
            '<span id="search-result-count" class="sr-only">' + renderCountMessage($wrapper, total) + '</span>' +
            '<span id="search-assistive-text" class="sr-only">' + escapeHtml(readData($wrapper, 'assistiveText', '')) + '</span>' +
            '</div>';

        $wrapper.empty().append(markup).show();
        setExpanded(scope, true);
        positionSuggestions(scope);
        applyModals(scope);
    }

    function setSelectedItem(scope, $item) {
        var $wrapper = getWrapper(scope);
        var $items = $wrapper.find('.suggestions .item');

        $items.removeClass('selected').removeAttr('aria-selected');

        if ($item && $item.length) {
            $item.addClass('selected');
            $item.attr('aria-selected', 'true');
            $(scope).attr('aria-activedescendant', $item.attr('id') || '');
            return;
        }

        $(scope).attr('aria-activedescendant', '');
    }

    function moveSelection(scope, direction) {
        var $wrapper = getWrapper(scope);
        var $items = $wrapper.find('.suggestions .item');
        var $current = $items.filter('.selected');
        var nextIndex = 0;

        if (!$items.length) {
            return;
        }

        if ($current.length) {
            nextIndex = $items.index($current) + direction;

            if (nextIndex < 0) {
                nextIndex = $items.length - 1;
            }

            if (nextIndex >= $items.length) {
                nextIndex = 0;
            }
        }

        setSelectedItem(scope, $items.eq(nextIndex));
    }

    function callEndpoint(url, data, onSuccess, onError) {
        return $.ajax({
            url: url,
            method: 'GET',
            data: $.extend({}, data, getDebugParams()),
            success: onSuccess,
            error: onError || $.noop
        });
    }

    function requestEndpoint(scope, requestName, url, data, onSuccess, onError) {
        var xhr = trackPendingRequest(scope, requestName, callEndpoint(url, data, function (payload) {
            releasePendingRequest(scope, requestName, xhr);
            onSuccess(payload || {});
        }, function (jqXHR, textStatus) {
            releasePendingRequest(scope, requestName, xhr);

            if (textStatus === 'abort') {
                return;
            }

            if (onError) {
                onError(jqXHR, textStatus);
            }
        }));

        return xhr;
    }

    function renderBootstrap(scope, payload) {
        var $wrapper = getWrapper(scope);
        var recentSearches = mapRecentSearches(scope);

        renderSuggestions(scope, [
            {
                title: readData($wrapper, 'labelRecent', ''),
                items: recentSearches,
                renderer: renderQuerySection,
                baseId: 'recent-query'
            },
            {
                title: readData($wrapper, 'labelPopularSearches', ''),
                items: payload.popularSearches || [],
                renderer: renderQuerySection,
                baseId: 'popular-query'
            },
            {
                title: readData($wrapper, 'labelPopularProducts', ''),
                items: payload.popularProducts || [],
                renderer: renderProductsSection,
                baseId: 'popular-product'
            }
        ]);
    }

    function mapPreviewableSuggestions(suggestions) {
        return (suggestions || []).map(function (suggestion) {
            return {
                value: suggestion.value,
                url: suggestion.url,
                previewQuery: suggestion.value
            };
        });
    }

    function renderTypedState(scope, suggestions, products) {
        var $wrapper = getWrapper(scope);

        renderSuggestions(scope, [
            {
                title: readData($wrapper, 'labelSuggestions', ''),
                items: mapPreviewableSuggestions(suggestions || []),
                renderer: renderQuerySection,
                baseId: 'typed-query'
            },
            {
                title: readData($wrapper, 'labelProducts', ''),
                items: products || [],
                renderer: renderProductsSection,
                baseId: 'typed-product'
            }
        ]);
    }

    function setActiveRequest(scope) {
        var requestId = (parseInt($(scope).attr('data-coveo-request-id') || '0', 10) || 0) + 1;

        $(scope).attr('data-coveo-request-id', requestId);
        return requestId;
    }

    function isStaleRequest(scope, requestId) {
        return String($(scope).attr('data-coveo-request-id') || '') !== String(requestId);
    }

    function loadPreview(scope, originalQuery, previewQuery, requestId) {
        var $wrapper = getWrapper(scope);
        var previewUrl = readData($wrapper, 'previewUrl', '');
        var cacheKey = buildCacheKey(previewUrl, previewQuery);
        var cachedPayload = null;

        if (!previewQuery) {
            updateTypedState(scope, requestId, originalQuery, {
                previewQuery: '',
                products: []
            });
            renderStoredTypedState(scope, requestId, originalQuery);
            return;
        }

        if (!updateTypedState(scope, requestId, originalQuery, {
            previewQuery: previewQuery
        })) {
            return;
        }

        cachedPayload = readCache(previewCache, cacheKey, PRODUCT_PREVIEW_CACHE_TTL);

        if (cachedPayload) {
            updateTypedState(scope, requestId, originalQuery, {
                products: cachedPayload.products || []
            });
            renderStoredTypedState(scope, requestId, originalQuery);
            return;
        }

        requestEndpoint(scope, REQUEST_TYPES.PREVIEW, previewUrl, {
            q: previewQuery
        }, function (payload) {
            var state;

            if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()) !== originalQuery) {
                return;
            }

            state = getTypedState(scope, requestId, originalQuery);

            if (!state || state.previewQuery !== previewQuery) {
                return;
            }

            writeCache(previewCache, cacheKey, payload);
            updateTypedState(scope, requestId, originalQuery, {
                products: (payload && payload.products) || []
            });
            renderStoredTypedState(scope, requestId, originalQuery);
        }, function () {
            var state = getTypedState(scope, requestId, originalQuery);

            if (isStaleRequest(scope, requestId)) {
                return;
            }

            if (!state || state.previewQuery !== previewQuery) {
                return;
            }

            updateTypedState(scope, requestId, originalQuery, {
                products: []
            });
            renderStoredTypedState(scope, requestId, originalQuery);
        });
    }

    function loadTypedSuggestions(scope) {
        var $wrapper = getWrapper(scope);
        var suggestUrl = readData($wrapper, 'suggestUrl', '');
        var query = normalizeString($(scope).val());
        var minChars = parseInt(readData($wrapper, 'minChars', 2), 10);
        var cachedSuggestions;
        var cacheKey;
        var requestId;

        if (!query.length) {
            abortPendingRequests(scope, [REQUEST_TYPES.SUGGEST, REQUEST_TYPES.PREVIEW]);
            loadBootstrap(scope);
            return;
        }

        abortPendingRequest(scope, REQUEST_TYPES.BOOTSTRAP);

        if (query.length < minChars) {
            abortPendingRequests(scope, [REQUEST_TYPES.SUGGEST, REQUEST_TYPES.PREVIEW]);
            clearTypedState(scope);
            $wrapper.empty().hide();
            setExpanded(scope, false);
            clearModals();
            return;
        }

        requestId = setActiveRequest(scope);
        setTypedState(scope, {
            requestId: requestId,
            query: query,
            previewQuery: query,
            suggestions: [],
            products: []
        });
        cacheKey = buildCacheKey(suggestUrl, query);
        cachedSuggestions = readCache(suggestCache, cacheKey, QUERY_SUGGEST_CACHE_TTL);

        if (cachedSuggestions) {
            updateTypedState(scope, requestId, query, {
                suggestions: (cachedSuggestions.suggestions) || []
            });
            renderStoredTypedState(scope, requestId, query);
        } else {
            requestEndpoint(scope, REQUEST_TYPES.SUGGEST, suggestUrl, {
                q: query
            }, function (payload) {
                if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()) !== query) {
                    return;
                }

                writeCache(suggestCache, cacheKey, payload);
                updateTypedState(scope, requestId, query, {
                    suggestions: (payload && payload.suggestions) || []
                });
                renderStoredTypedState(scope, requestId, query);
            }, function () {
                if (isStaleRequest(scope, requestId)) {
                    return;
                }

                updateTypedState(scope, requestId, query, {
                    suggestions: []
                });
                renderStoredTypedState(scope, requestId, query);
            });
        }

        loadPreview(scope, query, query, requestId);
    }

    function loadBootstrap(scope) {
        var $wrapper = getWrapper(scope);
        var bootstrapUrl = readData($wrapper, 'bootstrapUrl', '');
        var cacheKey = buildCacheKey(bootstrapUrl, 'bootstrap');
        var cachedPayload = readCache(bootstrapCache, cacheKey, BOOTSTRAP_CACHE_TTL);
        var requestId = setActiveRequest(scope);

        clearTypedState(scope);
        abortPendingRequests(scope, [REQUEST_TYPES.SUGGEST, REQUEST_TYPES.PREVIEW]);

        if (cachedPayload) {
            renderBootstrap(scope, cachedPayload);
            return;
        }

        requestEndpoint(scope, REQUEST_TYPES.BOOTSTRAP, bootstrapUrl, {}, function (payload) {
            if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()).length) {
                return;
            }

            writeCache(bootstrapCache, cacheKey, payload);
            renderBootstrap(scope, payload || {});
        }, function () {
            if (isStaleRequest(scope, requestId)) {
                return;
            }

            $wrapper.empty().hide();
            setExpanded(scope, false);
            clearModals();
        });
    }

    function stopLegacySearchHandlers(event) {
        if (event.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }

        if (event.stopPropagation) {
            event.stopPropagation();
        }
    }

    function getInputBindings(scope) {
        return $(scope).data('coveoInputBindings') || null;
    }

    function setInputBindings(scope, bindings) {
        $(scope).data('coveoInputBindings', bindings || null);
    }

    function removeInputBindings(scope) {
        var bindings = getInputBindings(scope);

        if (!bindings) {
            return;
        }

        scope.removeEventListener('focus', bindings.focus, true);
        scope.removeEventListener('keyup', bindings.keyup, true);
        scope.removeEventListener('keydown', bindings.keydown, true);
        setInputBindings(scope, null);
    }

    function bindInput(scope) {
        var debouncedLoad = debounce(function () {
            loadTypedSuggestions(scope);
        }, DEBOUNCE_DELAY);
        var bindings;

        removeInputBindings(scope);
        $(scope).off('keyup').off('focus').off('keydown');

        bindings = {
            focus: function (event) {
                stopLegacySearchHandlers(event);

                if (!normalizeString($(scope).val()).length) {
                    loadBootstrap(scope);
                    return;
                }

                debouncedLoad();
            },
            keyup: function (event) {
                stopLegacySearchHandlers(event);

                switch (event.which || event.keyCode) {
                    case DOWN_KEY:
                        moveSelection(scope, 1);
                        event.preventDefault();
                        break;
                    case UP_KEY:
                        moveSelection(scope, -1);
                        event.preventDefault();
                        break;
                    default:
                        debouncedLoad();
                }
            },
            keydown: function (event) {
                var $selectedLink;

                if ((event.which || event.keyCode) !== ENTER_KEY) {
                    return;
                }

                stopLegacySearchHandlers(event);
                $selectedLink = getWrapper(scope).find('.suggestions .item.selected a').first();

                if (!$selectedLink.length) {
                    return;
                }

                event.preventDefault();
                $selectedLink[0].click();
            }
        };

        scope.addEventListener('focus', bindings.focus, true);
        scope.addEventListener('keyup', bindings.keyup, true);
        scope.addEventListener('keydown', bindings.keydown, true);
        setInputBindings(scope, bindings);
    }

    function bindDelegatedEvents() {
        $('body').on('mouseenter.coveoSearchBox focus.coveoSearchBox', '.suggestions-wrapper[data-coveo-search-box="true"] a[data-preview-query]', function () {
            var $link = $(this);
            var $wrapper = $link.closest('.suggestions-wrapper');
            var scope = $wrapper.siblings('input.search-field')[0];
            var requestId = parseInt($(scope).attr('data-coveo-request-id') || '0', 10) || 0;
            var previewQuery = normalizeString($link.attr('data-preview-query'));
            var query = normalizeString($(scope).val());

            $wrapper.find('.suggestions .item').removeClass('selected').removeAttr('aria-selected');
            $link.closest('.item').addClass('selected').attr('aria-selected', 'true');
            $(scope).attr('aria-activedescendant', $link.closest('.item').attr('id') || '');

            if (previewQuery && query.length) {
                loadPreview(scope, query, previewQuery, requestId);
            }
        });

        $('body').on('click.coveoSearchBox', '.suggestions-wrapper[data-coveo-search-box="true"] a[data-search-query]', function () {
            saveRecentSearch($(this).attr('data-search-query'));
        });

        $('body').on('click.coveoSearchBox', 'button[name="reset-button"]', function (event) {
            var $form = $(this).closest('form[name="simpleSearch"]');
            var $input = $form.find('input.search-field');
            var $wrapper = $form.find('.suggestions-wrapper[data-coveo-search-box="true"]');

            event.preventDefault();
            $input.val('');
            abortPendingRequests($input[0], [REQUEST_TYPES.BOOTSTRAP, REQUEST_TYPES.SUGGEST, REQUEST_TYPES.PREVIEW]);
            clearTypedState($input[0]);
            $wrapper.empty().hide();
            setExpanded($input[0], false);
            clearModals();
        });

        $(document).on('click.coveoSearchBox', function (event) {
            if ($(event.target).closest('.suggestions-wrapper[data-coveo-search-box="true"], input.search-field').length) {
                return;
            }

            $('.suggestions-wrapper[data-coveo-search-box="true"]').empty().hide();
            $('input.search-field').attr('aria-expanded', 'false').attr('aria-activedescendant', '');
            clearModals();
        });

        $('form[name="simpleSearch"]').on('submit.coveoSearchBox', function () {
            var $form = $(this);
            var $selectedLink = $form.find('.suggestions-wrapper[data-coveo-search-box="true"] .item.selected a').first();
            var query = $selectedLink.length ? $selectedLink.attr('data-search-query') : $form.find('input.search-field').val();

            saveRecentSearch(query);
        });
    }

    $(function () {
        var $inputs = $('input.search-field').filter(function () {
            return !!getWrapper(this).length;
        });

        if (!$inputs.length) {
            return;
        }

        $inputs.each(function () {
            bindInput(this);
        });

        bindDelegatedEvents();
    });
}(window.jQuery, window, document));
