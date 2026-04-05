"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("./routes/auth"));
const barcode_1 = __importDefault(require("./routes/barcode"));
const collaboration_1 = __importDefault(require("./routes/collaboration"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const publicInvite_1 = __importDefault(require("./routes/publicInvite"));
const shoppingList_1 = __importDefault(require("./routes/shoppingList"));
const store_1 = __importDefault(require("./routes/store"));
exports.app = (0, express_1.default)();
exports.app.use(express_1.default.json());
exports.app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
exports.app.use('/', publicInvite_1.default);
exports.app.use('/auth', auth_1.default);
exports.app.use('/api/inventory', inventory_1.default);
exports.app.use('/api/shopping-list', shoppingList_1.default);
exports.app.use('/api/barcode', barcode_1.default);
exports.app.use('/api/store', store_1.default);
exports.app.use('/api/collaboration', collaboration_1.default);
if (require.main === module) {
    const PORT = process.env.PORT || 4000;
    exports.app.listen(PORT, () => {
        console.log(`Backend API running on port ${PORT}`);
    });
}
