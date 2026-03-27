"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inventory_1 = __importDefault(require("./inventory"));
const router = (0, express_1.Router)();
// Shopping list is backed by inventory items with status=In_List.
router.use('/', inventory_1.default);
exports.default = router;
