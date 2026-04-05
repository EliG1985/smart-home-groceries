"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupSupermarketPrices = exports.validatePriceLookupRequest = exports.getAvailableChains = void 0;
const supabaseClient_1 = require("./supabaseClient");
const BARCODE_PATTERN = /^\d{8,14}$/;
const normalizeString = (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const toQuote = (row) => ({
    chainId: row.chain_id,
    chainName: row.chain_name,
    storeId: row.store_id,
    storeName: row.store_name,
    city: row.city,
    barcode: row.barcode,
    productName: row.product_name,
    price: Number(row.price),
    currency: 'ILS',
    ...(row.promo_text ? { promoText: row.promo_text } : {}),
    lastUpdated: row.last_updated,
});
const getAvailableChains = async () => {
    const [{ data: chains, error: chainError }, { data: stores, error: storeError }] = await Promise.all([
        supabaseClient_1.supabase.from('chain_master').select('chain_id, chain_name').order('chain_name', { ascending: true }),
        supabaseClient_1.supabase.from('store_master').select('store_id, store_name, city, chain_id').order('store_name', { ascending: true }),
    ]);
    if (chainError) {
        throw new Error(`Failed to load chain_master: ${chainError.message}`);
    }
    if (storeError) {
        throw new Error(`Failed to load store_master: ${storeError.message}`);
    }
    const byChain = new Map();
    for (const row of (chains ?? [])) {
        byChain.set(row.chain_id, {
            id: row.chain_id,
            name: row.chain_name,
            cities: [],
            stores: [],
        });
    }
    for (const store of (stores ?? [])) {
        const chain = byChain.get(store.chain_id);
        if (!chain) {
            continue;
        }
        const city = store.city || '';
        if (city && !chain.cities.includes(city)) {
            chain.cities.push(city);
        }
        chain.stores.push({
            id: store.store_id,
            name: store.store_name,
            city,
        });
    }
    for (const chain of byChain.values()) {
        chain.cities.sort((a, b) => a.localeCompare(b));
        chain.stores.sort((a, b) => a.name.localeCompare(b.name));
    }
    return Array.from(byChain.values()).sort((a, b) => a.name.localeCompare(b.name));
};
exports.getAvailableChains = getAvailableChains;
const validatePriceLookupRequest = (payload) => {
    const errors = [];
    const barcode = normalizeString(payload.barcode);
    if (!barcode) {
        errors.push('barcode is required');
    }
    else if (!BARCODE_PATTERN.test(barcode)) {
        errors.push('barcode must be 8 to 14 digits');
    }
    if (payload.maxResults !== undefined) {
        if (!Number.isInteger(payload.maxResults) || payload.maxResults < 1 || payload.maxResults > 20) {
            errors.push('maxResults must be an integer between 1 and 20');
        }
    }
    return errors;
};
exports.validatePriceLookupRequest = validatePriceLookupRequest;
const lookupSupermarketPrices = async (payload) => {
    const barcode = normalizeString(payload.barcode) ?? '';
    const chainIds = Array.isArray(payload.chainIds) ? payload.chainIds.map((entry) => entry.trim()).filter(Boolean) : [];
    const city = normalizeString(payload.city)?.toLowerCase();
    const storeId = normalizeString(payload.storeId);
    const maxResults = payload.maxResults ?? 5;
    let query = supabaseClient_1.supabase
        .from('latest_price_snapshot')
        .select('chain_id, chain_name, store_id, store_name, city, barcode, product_name, price, promo_text, last_updated')
        .eq('barcode', barcode)
        .order('price', { ascending: true })
        .limit(maxResults);
    if (chainIds.length > 0) {
        query = query.in('chain_id', chainIds);
    }
    if (city) {
        query = query.ilike('city', city);
    }
    if (storeId) {
        query = query.eq('store_id', storeId);
    }
    const { data, error } = await query;
    if (error) {
        throw new Error(`Failed to query latest_price_snapshot: ${error.message}`);
    }
    const results = (data ?? [])
        .map(toQuote);
    const chains = await (0, exports.getAvailableChains)();
    return {
        barcode,
        found: results.length > 0,
        source: 'clean_room_snapshot',
        results,
        ...(results[0] ? { bestPrice: results[0] } : {}),
        chains,
    };
};
exports.lookupSupermarketPrices = lookupSupermarketPrices;
