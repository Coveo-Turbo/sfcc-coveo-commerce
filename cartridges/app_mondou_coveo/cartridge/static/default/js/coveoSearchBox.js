(function ($, window, document) {
    'use strict';

    var RECENT_SEARCHES_KEY = 'mondouCoveoRecentSearches';
    var MAX_RECENT_SEARCHES = 5;
    var DEBOUNCE_DELAY = 250;
    var DOWN_KEY = 40;
    var UP_KEY = 38;
    var ENTER_KEY = 13;

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
        $.ajax({
            url: url,
            method: 'GET',
            data: $.extend({}, data, getDebugParams()),
            success: onSuccess,
            error: onError || $.noop
        });
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

    function loadPreview(scope, originalQuery, previewQuery, suggestions, requestId) {
        var $wrapper = getWrapper(scope);
        var previewCache = $wrapper.data('coveoPreviewCache') || {};
        var previewUrl = readData($wrapper, 'previewUrl', '');

        if (!previewQuery) {
            renderTypedState(scope, suggestions, []);
            return;
        }

        if (previewCache[previewQuery]) {
            renderTypedState(scope, suggestions, previewCache[previewQuery].products || []);
            return;
        }

        callEndpoint(previewUrl, {
            q: previewQuery
        }, function (payload) {
            if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()) !== originalQuery) {
                return;
            }

            previewCache[previewQuery] = payload || {
                products: []
            };
            $wrapper.data('coveoPreviewCache', previewCache);
            renderTypedState(scope, suggestions, (payload && payload.products) || []);
        }, function () {
            if (isStaleRequest(scope, requestId)) {
                return;
            }

            renderTypedState(scope, suggestions, []);
        });
    }

    function loadTypedSuggestions(scope) {
        var $wrapper = getWrapper(scope);
        var suggestUrl = readData($wrapper, 'suggestUrl', '');
        var query = normalizeString($(scope).val());
        var minChars = parseInt(readData($wrapper, 'minChars', 2), 10);
        var requestId;

        if (!query.length) {
            loadBootstrap(scope);
            return;
        }

        if (query.length < minChars) {
            $wrapper.empty().hide();
            setExpanded(scope, false);
            clearModals();
            return;
        }

        requestId = setActiveRequest(scope);

        callEndpoint(suggestUrl, {
            q: query
        }, function (payload) {
            var suggestions = (payload && payload.suggestions) || [];
            var previewQuery = suggestions.length ? suggestions[0].value : query;

            if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()) !== query) {
                return;
            }

            renderTypedState(scope, suggestions, []);
            loadPreview(scope, query, previewQuery, suggestions, requestId);
        }, function () {
            if (isStaleRequest(scope, requestId)) {
                return;
            }

            $wrapper.empty().hide();
            setExpanded(scope, false);
            clearModals();
        });
    }

    function loadBootstrap(scope) {
        var $wrapper = getWrapper(scope);
        var bootstrapUrl = readData($wrapper, 'bootstrapUrl', '');
        var requestId = setActiveRequest(scope);

        callEndpoint(bootstrapUrl, {}, function (payload) {
            if (isStaleRequest(scope, requestId) || normalizeString($(scope).val()).length) {
                return;
            }

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

    function bindInput(scope) {
        var debouncedLoad = debounce(function () {
            loadTypedSuggestions(scope);
        }, DEBOUNCE_DELAY);

        $(scope).off('keyup').off('focus');

        $(scope).on('focus.coveoSearchBox', function () {
            if (!normalizeString($(this).val()).length) {
                loadBootstrap(this);
                return;
            }

            debouncedLoad.call(this);
        });

        $(scope).on('keyup.coveoSearchBox', function (event) {
            switch (event.which) {
                case DOWN_KEY:
                    moveSelection(this, 1);
                    event.preventDefault();
                    break;
                case UP_KEY:
                    moveSelection(this, -1);
                    event.preventDefault();
                    break;
                default:
                    debouncedLoad.call(this);
            }
        });

        $(scope).on('keydown.coveoSearchBox', function (event) {
            var $selectedLink;

            if (event.which !== ENTER_KEY) {
                return;
            }

            $selectedLink = getWrapper(this).find('.suggestions .item.selected a').first();

            if (!$selectedLink.length) {
                return;
            }

            event.preventDefault();
            $selectedLink[0].click();
        });
    }

    function bindDelegatedEvents() {
        $('body').on('mouseenter.coveoSearchBox focus.coveoSearchBox', '.suggestions-wrapper[data-coveo-search-box="true"] a[data-preview-query]', function () {
            var $link = $(this);
            var $wrapper = $link.closest('.suggestions-wrapper');
            var scope = $wrapper.siblings('input.search-field')[0];
            var requestId = parseInt($(scope).attr('data-coveo-request-id') || '0', 10) || 0;
            var previewQuery = normalizeString($link.attr('data-preview-query'));
            var query = normalizeString($(scope).val());
            var suggestions = [];

            $wrapper.find('.suggestions .item').removeClass('selected').removeAttr('aria-selected');
            $link.closest('.item').addClass('selected').attr('aria-selected', 'true');
            $(scope).attr('aria-activedescendant', $link.closest('.item').attr('id') || '');

            $wrapper.find('.suggestions .item a[data-preview-query]').each(function () {
                suggestions.push({
                    value: normalizeString($(this).attr('data-search-query')),
                    url: $(this).attr('href')
                });
            });

            if (previewQuery && query.length) {
                loadPreview(scope, query, previewQuery, suggestions, requestId);
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
