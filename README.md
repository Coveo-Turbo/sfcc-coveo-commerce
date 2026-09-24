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
npm run packageMetadata
```

After activating the uploaded code version, importing the metadata, and configuring the site preferences and SFCC services, run the sandbox route/status smoke matrix:

```text
export COVEO_BASE_URL="https://<sandbox-host>/on/demandware.store/Sites-<site-id>-Site/fr_CA"
npm run validateServices
```

`dw.json` is intentionally ignored and should stay local to your machine.

The metadata packaging step creates `dist/int_coveo_commerce_site_preferences.zip`, which you can import in Business Manager so the `Coveo Commerce` custom site-preference group and the starter service definitions appear on your target instance.

The cartridge now uses concrete SFCC `LocalServiceRegistry` services for outbound HTTP calls. The metadata package includes these HTTP services:

- `coveo.http.commerce.api`
- `coveo.http.search.token`

## Cartridge Path and Controllers

The cartridge must be present on the site cartridge path. Ordering depends on how the storefront integrates its controllers. For an intentionally standalone demonstration against SFRA base, the order can be:

```text
int_coveo_commerce:app_storefront_base
```

SFCC resolves controllers from left to right and does not merge controllers with the same filename automatically. With the order above, the sample `Search.js` and `Category.js` replace downstream controllers and can hide SFRA routes they do not declare. Do not use this ordering unchanged in an existing storefront without reviewing those controllers.

The recommended customer integration is to keep the storefront cartridge in control, call `CommerceApiService` from its existing controllers, and expose only the routes it needs. Placing a custom cartridge before `int_coveo_commerce` also allows mapper or service overrides, but does not automatically make the sample `Search-*` or `Category-*` routes available; the custom controller must explicitly expose or chain them.
