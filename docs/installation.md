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

## Mondou Validation Overlay

This repository also includes a temporary Mondou-specific overlay cartridge used to validate the integration approach:

```text
cartridges/app_mondou_coveo
```

Use it only in the Mondou storefront stack, and place it immediately before `app_mondou`.
Keep `int_coveo_commerce` after Mondou's existing `Search.js` inheritance chain, which in practice means after `app_storefront_base` in the current Mondou stack:

```text
bm_coveo:int_coveo:app_mondou_coveo:app_mondou:...:app_storefront_base:int_coveo_commerce
```

That placement keeps `int_coveo_commerce` generic while allowing `app_mondou_coveo` to override Mondou’s existing `Search` controller chain.
This matters because SFCC resolves the first matching controller in the cartridge path, and Mondou's native `Search.js` still depends on its downstream `superModule` chain for routes such as `ShowAjax`.
This overlay is not part of the long-term generic cartridge deliverable and is expected to move to a separate Mondou-owned repo or delivery package later.

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
```

Import that ZIP in Business Manager through:

```text
Administration -> Site Development -> Site Import & Export
```

Use an import mode that merges metadata into the instance.
After the import completes, switch to the target site, such as `Mondou_CA`, and configure the values under:

```text
Merchant Tools -> Site Preferences -> Custom Preferences -> Coveo Commerce
```

For Mondou validation work:

```text
npm run uploadMondouValidation
npm run uploadMondouOverlay
```

Keep `dw.json` local and out of source control.

## Next Steps

- Configure credentials and runtime settings
- Wire the search and category routes to your storefront flow
- Connect query suggestions and recommendation slots
- Push analytics events with your GTM or storefront analytics layer
