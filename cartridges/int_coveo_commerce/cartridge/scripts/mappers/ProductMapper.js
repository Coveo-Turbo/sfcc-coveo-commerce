'use strict';

function mapPrice(product) {
    if (!product) {
        return null;
    }

    if (typeof product.price !== 'undefined') {
        return product.price;
    }

    if (product.pricing && typeof product.pricing.price !== 'undefined') {
        return product.pricing.price;
    }

    if (typeof product.ec_promo_price !== 'undefined') {
        return product.ec_promo_price;
    }

    if (product.ec_price && typeof product.ec_price !== 'undefined') {
        return product.ec_price;
    }

    return null;
}

function mapImage(product) {
    if (!product) {
        return '';
    }

    if (product.ec_thumbnails && product.ec_thumbnails.length) {
        return product.ec_thumbnails[0];
    }

    if (product.ec_images && product.ec_images.length) {
        return product.ec_images[0];
    }

    return product.image || product.imageUrl || product.thumbnail || product.ec_image || '';
}

function map(product) {
    var source = product || {};

    return {
        id: source.id || source.productId || source.ec_product_id || '',
        sku: source.sku || source.productSku || '',
        name: source.name || source.title || source.ec_name || '',
        url: source.url || source.productUrl || source.clickUri || '',
        image: mapImage(source),
        price: mapPrice(source),
        raw: source
    };
}

module.exports = {
    map: map
};
