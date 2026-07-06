# sfcc-coveo-commerce

`sfcc-coveo-commerce` provides the `int_coveo_commerce` Salesforce Commerce Cloud cartridge for integrating an existing SFRA storefront with the Coveo Commerce API.

The cartridge is intentionally integration-focused. It owns Commerce API access, authentication, normalized response mapping, analytics context, configuration, and thin sample controllers. It does not ship storefront UI, templates, CSS, JavaScript widgets, or customer-specific business logic.

## Ecosystem

These repositories are designed to complement each other:

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
        ListingResultMapper.js
        PaginationMapper.js
        ProductMapper.js
        RecommendationMapper.js
        SearchResultMapper.js
        SortMapper.js
      services/
        AnalyticsService.js
        AuthenticationService.js
        CommerceApiService.js
        HttpClient.js
```

## Responsibilities

- Coveo Commerce API integration
- Bearer-token authentication with a future OAuth seam
- Search and category listing service wrappers
- Query suggest and recommendations wrappers
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

## Cartridge Path

Typical cartridge path ordering:

```text
int_coveo_commerce:app_storefront_base
```

Customers can place their own storefront cartridge ahead of `int_coveo_commerce` to override sample controllers, mappers, or services.
