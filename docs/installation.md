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

Typical generic cartridge path:

```text
int_coveo_commerce:app_storefront_base
```

If your storefront overrides the sample controllers or mappers from this cartridge, place the custom cartridge before `int_coveo_commerce`.

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
- Connect query suggestions and recommendation slots
- Push analytics events with your GTM or storefront analytics layer
