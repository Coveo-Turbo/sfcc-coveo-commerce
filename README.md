# sfcc-coveo-commerce

`sfcc-coveo-commerce` provides the reusable `int_coveo_commerce` Salesforce Commerce Cloud cartridge for integrating an existing SFRA storefront with the Coveo Commerce API.

The cartridge is intentionally integration-focused. It owns Commerce API access, authentication, normalized response mapping, analytics context, configuration, and thin sample controllers. It does not ship storefront UI, templates, CSS, JavaScript widgets, or customer-specific business logic.

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
      controllers/
        Search.js
        Category.js
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
- PDP, cart, checkout, inventory, or pricing logic
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
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
npm run validateServices
cp dw.example.json dw.json
npm run uploadCartridge
npm run packageMetadata
```

`dw.json` is intentionally ignored and should stay local to your machine.

The metadata packaging step creates `dist/int_coveo_commerce_site_preferences.zip`, which you can import in Business Manager so the `Coveo Commerce` custom site-preference group and the starter service definitions appear on your target instance.

The cartridge now uses concrete SFCC `LocalServiceRegistry` services for outbound HTTP calls. The metadata package includes these HTTP services:

- `coveo.http.commerce.api`
- `coveo.http.search.token`

## Cartridge Path

Typical generic cartridge path ordering:

```text
int_coveo_commerce:app_storefront_base
```

Customers can place their own storefront cartridge ahead of `int_coveo_commerce` to override sample controllers, mappers, or services.
