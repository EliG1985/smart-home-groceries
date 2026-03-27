"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const INVENTORY_STATUSES = ['In_List', 'At_Home'];
const USER_ROLES = ['owner', 'editor', 'viewer'];
const SUBSCRIPTION_TIERS = ['Free', 'Premium'];
// In-memory store for initial contract implementation.
const inventoryStore = [];
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
const isIsoDate = (value) => !Number.isNaN(Date.parse(value));
const getFamilyContext = (req) => {
    const familyId = normalizeString(req.header('x-family-id')) || 'demo-family';
    const rawRole = normalizeString(req.header('x-user-role')) || 'owner';
    const role = USER_ROLES.includes(rawRole)
        ? rawRole
        : 'owner';
    const rawTier = normalizeString(req.header('x-subscription-tier')) || 'Free';
    const subscriptionTier = SUBSCRIPTION_TIERS.includes(rawTier)
        ? rawTier
        : 'Free';
    const membersCountHeader = normalizeNumber(req.header('x-family-members-count'));
    const familyMembersCount = membersCountHeader && membersCountHeader > 0 ? membersCountHeader : 1;
    const userId = normalizeString(req.header('x-user-id')) || 'demo-user';
    return { familyId, role, subscriptionTier, familyMembersCount, userId };
};
const canWriteForFamily = (req, res) => {
    const { role, subscriptionTier, familyMembersCount } = getFamilyContext(req);
    if (role === 'viewer') {
        errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Viewer role is not allowed to modify inventory or shopping list data.');
        return false;
    }
    if (familyMembersCount > 1 && subscriptionTier !== 'Premium') {
        errorResponse(res, 402, 'PREMIUM_REQUIRED', 'Premium subscription is required for shared family write operations.');
        return false;
    }
    return true;
};
const mapCreatePayload = (req) => {
    const { familyId, userId } = getFamilyContext(req);
    const body = req.body || {};
    const productName = normalizeString(body.product_name ?? body.productName);
    const category = normalizeString(body.category);
    const expiryDate = normalizeString(body.expiry_date ?? body.expiryDate);
    const statusRaw = normalizeString(body.status) || 'In_List';
    const status = INVENTORY_STATUSES.includes(statusRaw)
        ? statusRaw
        : undefined;
    const price = normalizeNumber(body.price);
    const quantity = normalizeNumber(body.quantity);
    const addedBy = normalizeString(body.added_by ?? body.addedBy) || userId;
    const errors = [];
    if (!productName) {
        errors.push('product_name is required');
    }
    if (!category) {
        errors.push('category is required');
    }
    if (!expiryDate) {
        errors.push('expiry_date is required');
    }
    else if (!isIsoDate(expiryDate)) {
        errors.push('expiry_date must be a valid date');
    }
    if (!status) {
        errors.push('status must be one of In_List | At_Home');
    }
    if (price === undefined) {
        errors.push('price is required');
    }
    else if (price < 0) {
        errors.push('price must be >= 0');
    }
    if (quantity === undefined) {
        errors.push('quantity is required');
    }
    else if (quantity <= 0) {
        errors.push('quantity must be > 0');
    }
    return {
        payload: {
            familyId,
            productName: productName || '',
            category: category || '',
            expiryDate: expiryDate || '',
            status: status || 'In_List',
            price: price ?? 0,
            quantity: quantity ?? 1,
            addedBy,
        },
        errors,
    };
};
router.get('/', (req, res) => {
    const { familyId } = getFamilyContext(req);
    const requestedStatus = normalizeString(req.query.status);
    const items = inventoryStore
        .filter((item) => item.familyId === familyId)
        .filter((item) => {
        if (!requestedStatus) {
            return true;
        }
        return item.status === requestedStatus;
    })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return res.json({ items, total: items.length });
});
router.post('/', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const { payload, errors } = mapCreatePayload(req);
    if (errors.length > 0) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid inventory create payload.', errors);
        return;
    }
    const now = new Date().toISOString();
    const item = {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...payload,
    };
    inventoryStore.push(item);
    res.status(201).json(item);
});
router.patch('/:id', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const { familyId } = getFamilyContext(req);
    const item = inventoryStore.find((entry) => entry.id === req.params.id && entry.familyId === familyId);
    if (!item) {
        errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found.');
        return;
    }
    const body = req.body || {};
    const nextProductName = normalizeString(body.product_name ?? body.productName);
    const nextCategory = normalizeString(body.category);
    const nextExpiryDate = normalizeString(body.expiry_date ?? body.expiryDate);
    const nextPrice = normalizeNumber(body.price);
    const nextQuantity = normalizeNumber(body.quantity);
    const errors = [];
    if (nextExpiryDate && !isIsoDate(nextExpiryDate)) {
        errors.push('expiry_date must be a valid date');
    }
    if (nextPrice !== undefined && nextPrice < 0) {
        errors.push('price must be >= 0');
    }
    if (nextQuantity !== undefined && nextQuantity <= 0) {
        errors.push('quantity must be > 0');
    }
    if (errors.length > 0) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid inventory update payload.', errors);
        return;
    }
    item.productName = nextProductName ?? item.productName;
    item.category = nextCategory ?? item.category;
    item.expiryDate = nextExpiryDate ?? item.expiryDate;
    item.price = nextPrice ?? item.price;
    item.quantity = nextQuantity ?? item.quantity;
    item.updatedAt = new Date().toISOString();
    res.json(item);
});
router.patch('/:id/status', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const { familyId } = getFamilyContext(req);
    const item = inventoryStore.find((entry) => entry.id === req.params.id && entry.familyId === familyId);
    if (!item) {
        errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found.');
        return;
    }
    const statusRaw = normalizeString(req.body?.status);
    const status = INVENTORY_STATUSES.includes(statusRaw)
        ? statusRaw
        : undefined;
    if (!status) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'status must be one of In_List | At_Home');
        return;
    }
    item.status = status;
    item.updatedAt = new Date().toISOString();
    res.json(item);
});
router.delete('/:id', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const { familyId } = getFamilyContext(req);
    const index = inventoryStore.findIndex((entry) => entry.id === req.params.id && entry.familyId === familyId);
    if (index === -1) {
        errorResponse(res, 404, 'NOT_FOUND', 'Inventory item was not found.');
        return;
    }
    inventoryStore.splice(index, 1);
    res.json({ deletedId: req.params.id });
});
router.post('/batch/buy', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const itemIds = req.body?.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'itemIds must be a non-empty array of ids.');
        return;
    }
    const { familyId } = getFamilyContext(req);
    const idSet = new Set(itemIds);
    const updatedIds = [];
    for (const item of inventoryStore) {
        if (item.familyId !== familyId || !idSet.has(item.id)) {
            continue;
        }
        item.status = 'At_Home';
        item.updatedAt = new Date().toISOString();
        updatedIds.push(item.id);
    }
    res.json({ updatedCount: updatedIds.length, updatedIds });
});
router.post('/batch/delete', (req, res) => {
    if (!canWriteForFamily(req, res)) {
        return;
    }
    const itemIds = req.body?.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        errorResponse(res, 400, 'VALIDATION_ERROR', 'itemIds must be a non-empty array of ids.');
        return;
    }
    const { familyId } = getFamilyContext(req);
    const idSet = new Set(itemIds);
    const deletedIds = [];
    for (let index = inventoryStore.length - 1; index >= 0; index -= 1) {
        const item = inventoryStore[index];
        if (item.familyId !== familyId || !idSet.has(item.id)) {
            continue;
        }
        deletedIds.push(item.id);
        inventoryStore.splice(index, 1);
    }
    res.json({ deletedCount: deletedIds.length, deletedIds });
});
exports.default = router;
