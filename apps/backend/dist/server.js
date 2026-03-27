"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const shoppingList_1 = __importDefault(require("./routes/shoppingList"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/inventory', inventory_1.default);
app.use('/api/shopping-list', shoppingList_1.default);
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Backend API running on port ${PORT}`);
});
