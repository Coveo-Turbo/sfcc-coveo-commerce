# Installation Guide

## Prerequisites

- An SFRA-based storefront
- Access to the Coveo Commerce API
- The companion `sfcc-coveo-catalog-ingestion` process or another supported catalog synchronization flow

## Install The Cartridge

Add this repository to your SFCC project and ensure the cartridge is available under the `int_coveo_commerce` folder name.

Typical cartridge path:

```text
int_coveo_commerce:app_storefront_base
```

If your storefront overrides the sample controllers or mappers from this cartridge, place the custom cartridge before `int_coveo_commerce`.

## Deploy

Deploy the cartridge and import or configure the required site preferences described in the configuration guide.

## Next Steps

- Configure credentials and runtime settings
- Wire the search and category routes to your storefront flow
- Connect query suggestions and recommendation slots
- Push analytics events with your GTM or storefront analytics layer
