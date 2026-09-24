# Customization Guide

Scripts and mappers can be overridden from a custom storefront cartridge placed earlier in the cartridge path. Controllers require additional care: SFCC selects the first controller with a given filename and does not merge same-named controllers automatically.

For an existing storefront, prefer calling `CommerceApiService` from the storefront's controllers. If a customer `Search.js` or `Category.js` appears before this cartridge, it must explicitly expose or chain any sample routes it wants to retain. Conversely, placing `int_coveo_commerce` first can hide downstream storefront routes because its sample controllers are standalone.

## Common Override Points

- `controllers/Search.js`
- `controllers/Category.js`
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
- Replace the sample `Search-ProductSuggestions` route or call `CommerceApiService.productSuggest()` directly from a storefront-specific search-box controller
- Use `Search-Suggest` to read CMH-provided `fieldSuggestionsFacets`, then call `Search-Facet` or `CommerceApiService.facetSearch()` for the descriptors the storefront displays
- Pass `searchTokenOptions` when you need to control user groups, filters, or allowed dictionary keys in search-token mode
- Push GTM payloads through a custom client-side analytics integration

## GTM Integration

`GtmHelper.js` generates payloads for storefront analytics code to consume. It does not push events to `window.dataLayer` directly.

Typical storefront usage:

```javascript
var eventPayload = viewData.coveoDataLayer;
```

The storefront is responsible for deciding when and how to dispatch that payload.
