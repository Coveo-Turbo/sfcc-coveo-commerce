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

    if (product.ec_price && typeof product.ec_price !== 'undefined') {
        return product.ec_price;
    }

    return null;
}

function mapImage(product) {
    if (!product) {
        return '';
    }

    return product.image || product.imageUrl || product.thumbnail || product.ec_image || '';
}

function map(product) {
    var source = product || {};

    return {
        id: source.id || source.productId || source.ec_product_id || '',
        sku: source.sku || source.productSku || '',
        name: source.name || source.title || source.ec_name || '',
        url: source.url || source.productUrl || '',
        image: mapImage(source),
        price: mapPrice(source),
        raw: source
    };
}

module.exports = {
    map: map
};
