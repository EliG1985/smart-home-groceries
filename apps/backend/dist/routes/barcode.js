"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BARCODE_PATTERN = /^\d{8,14}$/;
const lookupCache = new Map();
const learnedMappings = new Map();
const errorResponse = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
const normalizeString = (value) => typeof value === 'string' ? value.trim() : undefined;
const normalizeNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
const getFamilyId = (req) => normalizeString(req.header('x-family-id')) || 'demo-family';
const nowIso = () => new Date().toISOString();
const toTitleCase = (value) => value
    .split(/[_\- ]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');
const normalizeCategoryFromOff = (raw) => {
    const value = normalizeString(raw);
    if (!value) {
        return undefined;
    }
    const noLangPrefix = value.includes(':') ? value.split(':')[1] : value;
    return noLangPrefix ? toTitleCase(noLangPrefix) : undefined;
};
const cacheKey = (familyId, barcode) => `${familyId}:${barcode}`;
const createTraceId = () => `barcode_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const createLookupResponse = (params) => ({
    traceId: createTraceId(),
    barcode: params.barcode,
    found: Boolean(params.product),
    ...(params.product ? { product: params.product } : {}),
    suggestions: params.suggestions ?? [],
    source: params.source,
});
const fetchOpenFoodFactsProduct = async (barcode, locale) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'smarthome-groceries-backend/0.1',
            },
        });
        if (!response.ok) {
            return undefined;
        }
        const payload = (await response.json());
        if (payload.status !== 1 || !payload.product) {
            return undefined;
        }
        const product = payload.product;
        const langKey = locale ? `product_name_${locale.toLowerCase()}` : undefined;
        const localizedName = langKey ? normalizeString(product[langKey]) : undefined;
        const productName = localizedName ||
            normalizeString(product.product_name) ||
            normalizeString(product.generic_name);
        if (!productName) {
            return undefined;
        }
        const categoriesTags = Array.isArray(product.categories_tags) ? product.categories_tags : [];
        const category = normalizeCategoryFromOff(categoriesTags[0] ?? product.categories);
        const packageSize = normalizeString(product.quantity);
        const brand = normalizeString(product.brands);
        const imageUrl = normalizeString(product.image_front_url ?? product.image_url);
        return {
            barcode,
            productName,
            ...(brand ? { brand } : {}),
            ...(category ? { category } : {}),
            ...(packageSize ? { packageSize } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        };
    }
    catch {
        return undefined;
    }
    finally {
        clearTimeout(timeout);
    }
};
const suggestionsFromProduct = (product, source) => {
    const suggestions = [];
    if (product.category) {
        suggestions.push({
            field: 'category',
            value: product.category,
            confidence: source === 'learned_mapping' ? 'high' : 'medium',
            source,
            reason: source === 'learned_mapping' ? 'Based on your previous confirmed mapping.' : 'Mapped from product taxonomy.',
        });
    }
    suggestions.push({
        field: 'quantity',
        value: 1,
        confidence: 'low',
        source,
        reason: 'Default quantity when no family-specific signal exists.',
    });
    return suggestions;
};
router.post('/lookup', async (req, res) => {
    try {
        const barcode = normalizeString(req.body?.barcode);
        const locale = normalizeString(req.body?.locale);
        if (!barcode) {
            return errorResponse(res, 400, 'VALIDATION_ERROR', 'barcode is required', ['barcode']);
        }
        if (!BARCODE_PATTERN.test(barcode)) {
            return errorResponse(res, 400, 'VALIDATION_ERROR', 'barcode must be 8 to 14 digits', ['barcode']);
        }
        const familyId = getFamilyId(req);
        const key = cacheKey(familyId, barcode);
        const learned = learnedMappings.get(key);
        if (learned) {
            const product = {
                barcode,
                productName: learned.productName,
                category: learned.category,
            };
            const suggestions = suggestionsFromProduct(product, 'learned_mapping');
            if (learned.typicalPrice !== undefined) {
                suggestions.push({
                    field: 'price',
                    value: learned.typicalPrice,
                    confidence: 'high',
                    source: 'learned_mapping',
                    reason: 'Based on your previous confirmed mapping.',
                });
            }
            if (learned.defaultQuantity !== undefined) {
                suggestions.push({
                    field: 'quantity',
                    value: learned.defaultQuantity,
                    confidence: 'high',
                    source: 'learned_mapping',
                    reason: 'Based on your previous confirmed mapping.',
                });
            }
            return res.json(createLookupResponse({
                barcode,
                source: 'learned_mapping',
                product,
                suggestions,
            }));
        }
        const cached = lookupCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            const value = cached.value;
            return res.json({
                ...value,
                source: 'local_cache',
            });
        }
        const product = await fetchOpenFoodFactsProduct(barcode, locale);
        const response = createLookupResponse({
            barcode,
            source: 'open_food_facts',
            ...(product ? { product, suggestions: suggestionsFromProduct(product, 'open_food_facts') } : {}),
        });
        lookupCache.set(key, {
            value: response,
            cachedAt: Date.now(),
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return res.json(response);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected server error.';
        return errorResponse(res, 500, 'INTERNAL_ERROR', message);
    }
});
router.post('/enrich', (req, res) => {
    try {
        const barcode = normalizeString(req.body?.barcode);
        const productName = normalizeString(req.body?.productName);
        const category = normalizeString(req.body?.category);
        const typicalPrice = normalizeNumber(req.body?.typicalPrice);
        const defaultQuantity = normalizeNumber(req.body?.defaultQuantity);
        const errors = [];
        if (!barcode) {
            errors.push('barcode is required');
        }
        else if (!BARCODE_PATTERN.test(barcode)) {
            errors.push('barcode must be 8 to 14 digits');
        }
        if (!productName) {
            errors.push('productName is required');
        }
        if (!category) {
            errors.push('category is required');
        }
        if (typicalPrice !== undefined && typicalPrice < 0) {
            errors.push('typicalPrice must be >= 0');
        }
        if (defaultQuantity !== undefined && defaultQuantity <= 0) {
            errors.push('defaultQuantity must be > 0');
        }
        if (errors.length > 0) {
            return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid enrich payload', errors);
        }
        const familyId = getFamilyId(req);
        const key = cacheKey(familyId, barcode);
        learnedMappings.set(key, {
            barcode: barcode,
            productName: productName,
            category: category,
            ...(typicalPrice !== undefined ? { typicalPrice } : {}),
            ...(defaultQuantity !== undefined ? { defaultQuantity } : {}),
            updatedAt: nowIso(),
        });
        lookupCache.delete(key);
        return res.status(201).json({ saved: true, barcode: barcode });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected server error.';
        return errorResponse(res, 500, 'INTERNAL_ERROR', message);
    }
});
router.get('/cache/:barcode', (req, res) => {
    try {
        const barcode = normalizeString(req.params.barcode);
        if (!barcode || !BARCODE_PATTERN.test(barcode)) {
            return errorResponse(res, 400, 'VALIDATION_ERROR', 'barcode must be 8 to 14 digits', ['barcode']);
        }
        const familyId = getFamilyId(req);
        const key = cacheKey(familyId, barcode);
        const cached = lookupCache.get(key);
        if (!cached || cached.expiresAt <= Date.now()) {
            return res.json({ hit: false });
        }
        return res.json({
            hit: true,
            cachedAt: new Date(cached.cachedAt).toISOString(),
            expiresAt: new Date(cached.expiresAt).toISOString(),
            value: cached.value,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected server error.';
        return errorResponse(res, 500, 'INTERNAL_ERROR', message);
    }
});
exports.default = router;
