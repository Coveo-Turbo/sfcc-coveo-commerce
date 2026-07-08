# sfcc-coveo-commerce

`sfcc-coveo-commerce` provides the `int_coveo_commerce` Salesforce Commerce Cloud cartridge for integrating an existing SFRA storefront with the Coveo Commerce API.

The primary deliverable in this repository is `int_coveo_commerce`. It currently also contains a temporary Mondou validation overlay, `app_mondou_coveo`, so we can validate the integration seam before that customer-specific work is moved to its own delivery boundary.

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

Core cartridge:

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
          SearchTokenService.js
```

Temporary validation overlay:

```text
cartridges/
  app_mondou_coveo/
    cartridge/
      controllers/
        Search.js
      scripts/
        helpers/
          coveoSearchHelpers.js
      templates/
        default/
          search/
            resultsCount.isml
            components/
              productTiles.isml
```

## Responsibilities

- Coveo Commerce API integration
- Dual authentication modes:
  - direct API-key bearer authentication for public storefronts
  - server-side search-token generation for authenticated storefronts
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

The `app_mondou_coveo` overlay is intentionally outside the generic cartridge contract and is present only as a short-term validation aid.

## Documentation

- [Installation Guide](docs/installation.md)
- [Configuration Guide](docs/configuration.md)
- [Integration Guide](docs/integration.md)
- [Customization Guide](docs/customization.md)

## Local Development

This repository follows the same SFCC npm workflow as `sfcc-coveo-catalog-ingestion`.

```text
npm install
cp dw.example.json dw.json
npm run uploadCartridge
npm run packageMetadata
```

`dw.json` is intentionally ignored and should stay local to your machine.

The metadata packaging step creates `dist/int_coveo_commerce_site_preferences.zip`, which you can import in Business Manager so the `Coveo Commerce` custom site-preference group appears on your target site.

Mondou-only validation uploads:

```text
npm run uploadMondouValidation
npm run uploadMondouOverlay
```

## Cartridge Path

Typical generic cartridge path ordering:

```text
int_coveo_commerce:app_storefront_base
```

Customers can place their own storefront cartridge ahead of `int_coveo_commerce` to override sample controllers, mappers, or services.

For Mondou validation work, the starter overlay should sit immediately before `app_mondou`, while `int_coveo_commerce` stays elsewhere in the path, so that:

- `app_mondou_coveo` can extend Mondou storefront routes
- `int_coveo_commerce` remains reusable and storefront-agnostic
- rollback is a cartridge-path change instead of a code revert

Recommended Mondou segment:

```text
bm_coveo:int_coveo:app_mondou_coveo:app_mondou:...:app_storefront_base:int_coveo_commerce
```

This ordering is important because SFCC uses the first matching controller in the cartridge path.
`app_mondou_coveo` must appear before `app_mondou` to own `Search.js`, while `int_coveo_commerce` should stay after the existing Mondou `superModule` chain.
In the current Mondou storefront, that means keeping `int_coveo_commerce` after `app_storefront_base`, because `app_mondou/Search.js` still inherits routes such as `ShowAjax` from downstream search controllers.

Current Mondou starter scope:

- query search pages only
- sort and filter AJAX flows
- native category flows still handled by Mondou’s existing implementation
- query suggest and category-page migration intentionally deferred to later phases
- intended to be extracted into a separate Mondou delivery repo once the integration shape is validated
