# sfcc-coveo-commerce

`sfcc-coveo-commerce` provides the reusable `int_coveo_commerce` Salesforce Commerce Cloud cartridge for integrating an existing SFRA storefront with the Coveo Commerce API.

The reusable `int_coveo_commerce` cartridge is intentionally integration-focused. It owns Commerce API access, authentication, normalized response mapping, analytics context, configuration, models, mappers, and helpers. It does not ship storefront controllers, UI, templates, CSS, JavaScript widgets, or customer-specific business logic.

`app_coveo_commerce_demo` is a separate, optional reference cartridge. It contains thin sample routes only and depends on `int_coveo_commerce` being later on the cartridge path. It is not a customer storefront implementation.

## Ecosystem

```text
SFCC + Coveo

├── sfcc-coveo-catalog-ingestion
│      Catalog synchronization
│
└── sfcc-coveo-commerce
       Commerce API integration
```

- `sfcc-coveo-catalog-ingestion` synchronizes SFCC catalog data into Coveo.
- `sfcc-coveo-commerce` integrates runtime search, listing, suggestions, and recommendations with the Coveo Commerce API.

## Cartridge Structure

```text
cartridges/
  int_coveo_commerce/
    cartridge/
      models/
        SearchResult.js
        ListingResult.js
        RecommendationResult.js
      scripts/
        config/
          Config.js
        helpers/
          GtmHelper.js
          Logger.js
          QueryBuilder.js
          UrlHelper.js
        mappers/
          FacetMapper.js
          FacetSearchMapper.js
          ListingResultMapper.js
          PaginationMapper.js
          ProductMapper.js
          ProductSuggestionMapper.js
          QuerySuggestionMapper.js
          RecommendationMapper.js
          SearchResultMapper.js
          SortMapper.js
        services/
          AnalyticsService.js
          CommerceApiService.js
          CoveoCommerceHttpService.js
          CoveoSearchTokenHttpService.js
          CoveoServiceSupport.js
          SearchTokenService.js
  app_coveo_commerce_demo/
    cartridge/
      controllers/
        Search.js
        Category.js
```

## Responsibilities

- Coveo Commerce API integration
- Direct API-key bearer authentication through SFCC service credentials
- Server-side search-token authentication
- Search and category listing service wrappers
- Query suggest, product suggest, and recommendations wrappers
- Query-suggest field facets and standalone facet-search support
- Analytics context management, including `clientId`
- Normalized result models for storefront integration
- GTM helper payload generation
- Centralized configuration, logging, and error handling

## Non-Goals

- ISML templates
- CSS or JavaScript UI components
- PDP, cart, checkout, inventory, price-book selection, pricing calculation, or customer-specific pricing logic
- Customer-specific storefront business rules

## Documentation

- [Installation Guide](docs/installation.md)
- [Configuration Guide](docs/configuration.md)
- [Integration Guide](docs/integration.md)
- [Customization Guide](docs/customization.md)
- [Validation Guide](docs/validation.md)

## Local Development

```text
npm install
npm test
cp dw.example.json dw.json
npm run uploadCartridge
npm run uploadDemoCartridge # Required for the default demo-route validation below
npm run packageMetadata
```

After activating the uploaded code version, importing the metadata, and configuring the site preferences and SFCC services, run the sandbox route/status smoke matrix:

```text
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
npm run validateServices
```

The matrix defaults to the demo `Search-*` and `Category-Show` routes. To validate a customer storefront without deploying `app_coveo_commerce_demo`, configure the equivalent `COVEO_ROUTE_*` mappings described in the [Validation Guide](docs/validation.md).

`dw.json` is intentionally ignored and should stay local to your machine.

The metadata packaging step creates `dist/int_coveo_commerce_site_preferences.zip`, which you can import in Business Manager so the `Coveo Commerce` custom site-preference group and the starter service definitions appear on your target instance.

The cartridge now uses concrete SFCC `LocalServiceRegistry` services for outbound HTTP calls. The metadata package includes these HTTP services:

- `coveo.http.commerce.api`
- `coveo.http.search.token`

## Cartridge Path and Controllers

The integration cartridge must be present on the site cartridge path. It has no controllers, so it cannot replace or hide SFRA or customer controllers. Production integrations should keep the storefront in control and call `CommerceApiService` from their existing controllers:

```text
app_custom_storefront:int_coveo_commerce:app_storefront_base
```

For an intentionally standalone reference installation, deploy the optional demo cartridge and use:

```text
app_coveo_commerce_demo:int_coveo_commerce:app_storefront_base
```

The demo provides `Search-*` and `Category-Show` reference routes, including `Search-InitializeAnalytics`. SFCC resolves controllers from left to right and does not merge same-named controllers. Keep this demo-only path out of production storefronts because its `Search.js` and `Category.js` intentionally take precedence over downstream controllers.

## Migration from Earlier Releases

Earlier releases exposed sample `Search-*` and `Category-Show` routes from `int_coveo_commerce`. Those routes now reside in `app_coveo_commerce_demo`. Users relying on them must either deploy the demo cartridge before `int_coveo_commerce`, or move the required calls to customer-owned controllers. New integrations should use the latter approach.
