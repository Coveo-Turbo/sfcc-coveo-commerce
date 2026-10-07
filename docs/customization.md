# Customization Guide

Scripts and mappers can be overridden from a custom storefront cartridge placed earlier in the cartridge path. `int_coveo_commerce` contains no controllers, so its installation cannot shadow customer routes.

For an existing storefront, call `CommerceApiService` from the storefront's controllers. The optional `app_coveo_commerce_demo` cartridge has standalone `Search.js` and `Category.js`; use it only for reference. SFCC selects the first same-named controller on the cartridge path and does not merge controllers automatically.

## Common Override Points

- Customer-owned `controllers/Search.js` or search-box controller
- Customer-owned `controllers/Category.js`
- `scripts/services/CommerceApiService.js`
- `scripts/services/CoveoCommerceHttpService.js`
- `scripts/services/CoveoSearchTokenHttpService.js`
- `scripts/services/AnalyticsService.js`
- `scripts/services/SearchTokenService.js`
- `scripts/mappers/ProductMapper.js`
- `scripts/mappers/QuerySuggestionMapper.js`
- `scripts/mappers/FacetSearchMapper.js`
- `scripts/mappers/RecommendationMapper.js`

## Typical Customizations

- Add storefront-specific request parameters before calling `CommerceApiService`
- Extend normalized product payloads with custom fields
- Change how facets or sorting are presented in view data
- Use the demo `Search-ProductSuggestions` route only as a reference, then call `CommerceApiService.productSuggest()` from a storefront-specific search-box controller
- Use a customer query-suggest endpoint to read CMH-provided `fieldSuggestionsFacets`, then call a customer facet endpoint or `CommerceApiService.facetSearch()` for the descriptors the storefront displays
- Pass `searchTokenOptions` when you need to control user groups, filters, or allowed dictionary keys in search-token mode
- Push GTM payloads through a custom client-side analytics integration

## GTM Integration

`GtmHelper.js` generates payloads for storefront analytics code to consume. It does not push events to `window.dataLayer` directly.

Typical storefront usage:

```javascript
var eventPayload = viewData.coveoDataLayer;
```

The storefront is responsible for deciding when and how to dispatch that payload.
