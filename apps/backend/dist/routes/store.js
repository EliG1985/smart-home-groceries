"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supermarketPricing_1 = require("../utils/supermarketPricing");
const router = (0, express_1.Router)();
const errorResponse = (res, status, code, message, details) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
router.get('/chains', async (req, res) => {
    try {
        const chains = await (0, supermarketPricing_1.getAvailableChains)();
        res.json({
            source: 'clean_room_snapshot',
            chains,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected server error.';
        return errorResponse(res, 500, 'DB_ERROR', message);
    }
});
router.post('/prices/by-barcode', async (req, res) => {
    const errors = (0, supermarketPricing_1.validatePriceLookupRequest)(req.body ?? {});
    if (errors.length > 0) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid supermarket price lookup payload', errors);
    }
    try {
        const response = await (0, supermarketPricing_1.lookupSupermarketPrices)(req.body);
        return res.json(response);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected server error.';
        return errorResponse(res, 500, 'DB_ERROR', message);
    }
});
exports.default = router;
