# Integration Guide

## Architecture

Current native flow:

```text
SFRA Controller -> ProductSearchModel -> Native SFCC Search
```

Integration flow with `int_coveo_commerce`:

```text
SFRA Controller -> CommerceApiService -> Coveo Commerce API
```

The storefront keeps ownership of templates, styling, JavaScript behavior, and customer-specific merchandising logic.

## Sample Controllers

The cartridge includes thin sample controllers:

- `Search-Show`
- `Search-Suggest`
- `Search-Recommendations`
- `Category-Show`

These controllers:

- read request parameters
- call `CommerceApiService`
- expose normalized data and analytics metadata through `res.setViewData()` or JSON responses

They do not ship templates. The sample page routes render existing SFRA search templates to demonstrate the integration seam, while customers remain free to override the controllers or use the service layer directly.

## Authentication Modes

`int_coveo_commerce` supports two server-side authentication modes:

- `apiKey`: uses a shared Commerce bearer token for each Commerce API request
- `searchToken`: uses server-side code in SFCC to mint a per-user search token, then authenticates Commerce API requests with that token

The search-token flow is useful when the storefront is authenticated and product visibility or pricing should vary by shopper identity or entitlements.
In this cartridge, the minted search token is used by the server-side integration layer and is not exposed to the storefront browser by default.

## Expected Customer Work

- Install the cartridge
- Configure site preferences
- Override or extend the sample `Search` and `Category` controllers as needed
- Wire existing templates to the normalized `coveoSearch` or `coveoListing` data contracts
- Connect autocomplete UI to `Search-Suggest`
- Connect recommendation slots to `Search-Recommendations`
- Push analytics events through GTM or another tracking layer

## Mondou Validation Overlay

For Mondou, this repository currently includes a temporary validation cartridge named `app_mondou_coveo`.

Its purpose is to show the refactoring seam between Mondou storefront code and `int_coveo_commerce` without forcing a full migration in one step.

Current starter scope:

- query search only
- sort and refinement flows backed by `CommerceApiService.search()`
- minimal template overrides to remove native `ProductSearchModel` assumptions
- native category handling preserved for now

This gives the Mondou team a safe incremental path:

```text
Search request with q
    -> app_mondou_coveo/Search.js
    -> int_coveo_commerce/CommerceApiService.search()
    -> Coveo Commerce API

Category request with cgid
    -> app_mondou_coveo/Search.js
    -> native Mondou search flow
```

Later phases can move category pages, query suggest, and deeper analytics behavior into the overlay once the search-only path is validated.

Once that shape is stable, `app_mondou_coveo` should be extracted from this repo and delivered through a Mondou-specific source boundary.

## Request Validation

The Mondou validation overlay supports an opt-in query parameter for server-side Commerce request inspection:

```text
?q=chien&coveoDebug=1
```

When `coveoDebug=1` is present on search, sort, or refinement requests, the integration writes a sanitized request and response summary as warning-level custom log entries.
In this cartridge, those entries are written to the `custom-CoveoCommerce-<instance>-<date>.log` file family.
This debug mode is intended for validation only and does not expose authorization headers, bearer tokens, or search tokens.

## Companion Repository

Use `sfcc-coveo-catalog-ingestion` alongside this repository when you need catalog synchronization from SFCC into Coveo. This repository is focused on runtime API integration only.
