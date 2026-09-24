# Installation Guide

## Prerequisites

- An SFRA-based storefront
- Access to the Coveo Commerce API
- The companion `sfcc-coveo-catalog-ingestion` process or another supported catalog synchronization flow

## Install The Cartridge

Add this repository to your SFCC project and ensure the cartridge is available under the `int_coveo_commerce` folder name.

The cartridge source lives in:

```text
cartridges/int_coveo_commerce
```

For an intentionally standalone demonstration against SFRA base, the cartridge path can be:

```text
int_coveo_commerce:app_storefront_base
```

This ordering makes the cartridge's standalone `Search.js` and `Category.js` the selected controllers. SFCC does not merge same-named controllers automatically, so these sample controllers can hide downstream SFRA routes they do not declare.

For an existing storefront, keep the customer cartridge in control and call `CommerceApiService` from its controllers. A common order is:

```text
app_custom_storefront:int_coveo_commerce:app_storefront_base
```

With that order, a customer `Search.js` or `Category.js` takes precedence and must explicitly expose or chain any desired sample routes. Mapper and service overrides can also be placed in the customer cartridge.

## Deploy

Deploy the cartridge and import the site-preference metadata before configuring the required values described in the configuration guide.

For the npm-based upload workflow used in this repository:

```text
npm install
cp dw.example.json dw.json
npm run uploadCartridge
npm run packageMetadata
```

`npm run packageMetadata` creates:

```text
dist/int_coveo_commerce_site_preferences.zip
```

The archive is packaged with the required SFCC root folder:

```text
int_coveo_commerce_site_preferences/
  meta/
    system-objecttype-extensions.xml
  services.xml
```

Import that ZIP in Business Manager through:

```text
Administration -> Site Development -> Site Import & Export
```

Use an import mode that merges metadata into the instance.
After the import completes, switch to the target site and configure the values under:

```text
Merchant Tools -> Site Preferences -> Custom Preferences -> Coveo Commerce
```

## Configure SFCC Services

The metadata package creates these HTTP services in Business Manager:

- `coveo.http.commerce.api`
- `coveo.http.search.token`

Recommended setup:

- Review the imported service profile and credential settings, and adjust them if your instance needs different timeout, rate limiting, or circuit-breaker values.
- Use `NONE` for authentication because the cartridge sets Coveo bearer headers at runtime.
- Set the `coveo.http.commerce.api` credential URL to your Coveo platform host, such as `https://platform.cloud.coveo.com`, and store the Commerce API token in that credential password when using `apiKey` mode.
- Set the `coveo.http.search.token` credential URL to your organization token host, such as `https://<org>.org.coveo.com`, and store the authenticated search API key in that credential password when using `searchToken` mode.
- Service credentials and profiles are the only supported place for API hosts, secrets, timeout, rate limiting, and circuit-breaker policy.

Business Manager path:

```text
Administration -> Operations -> Services
```

Keep `dw.json` local and out of source control.

## Next Steps

- Configure credentials and runtime settings
- Wire the search and category routes to your storefront flow
- Connect query suggestions, field-suggestion facet searches, and recommendation slots
- Push analytics events with your GTM or storefront analytics layer
