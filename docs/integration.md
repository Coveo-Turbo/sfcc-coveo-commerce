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

## Expected Customer Work

- Install the cartridge
- Configure site preferences
- Override or extend the sample `Search` and `Category` controllers as needed
- Wire existing templates to the normalized `coveoSearch` or `coveoListing` data contracts
- Connect autocomplete UI to `Search-Suggest`
- Connect recommendation slots to `Search-Recommendations`
- Push analytics events through GTM or another tracking layer

## Companion Repository

Use `sfcc-coveo-catalog-ingestion` alongside this repository when you need catalog synchronization from SFCC into Coveo. This repository is focused on runtime API integration only.
