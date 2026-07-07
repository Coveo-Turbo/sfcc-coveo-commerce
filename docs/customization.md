# Customization Guide

The cartridge is designed to be overridden from a custom storefront cartridge placed earlier in the cartridge path.

## Common Override Points

- `controllers/Search.js`
- `controllers/Category.js`
- `scripts/services/CommerceApiService.js`
- `scripts/services/AuthenticationService.js`
- `scripts/services/AnalyticsService.js`
- `scripts/services/SearchTokenService.js`
- `scripts/mappers/ProductMapper.js`
- `scripts/mappers/RecommendationMapper.js`

## Typical Customizations

- Add storefront-specific request parameters before calling `CommerceApiService`
- Extend normalized product payloads with custom fields
- Change how facets or sorting are presented in view data
- Pass `searchTokenOptions` when you need to control user groups, filters, or allowed dictionary keys in search-token mode
- Push GTM payloads through a custom client-side analytics integration

## GTM Integration

`GtmHelper.js` generates payloads for storefront analytics code to consume. It does not push events to `window.dataLayer` directly.

Typical storefront usage:

```javascript
var eventPayload = viewData.coveoDataLayer;
```

The storefront is responsible for deciding when and how to dispatch that payload.
