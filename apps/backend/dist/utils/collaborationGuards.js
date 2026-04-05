"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthenticatedUser = exports.requireAdminRole = exports.getRequesterPermissions = exports.getRequesterUserId = exports.getRequesterRole = exports.getFamilyId = exports.defaultPermissionsForRole = exports.normalizeRole = void 0;
const normalizeBooleanHeader = (value) => {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
            return true;
        }
        if (normalized === 'false') {
            return false;
        }
    }
    return undefined;
};
const normalizeRole = (input) => {
    if (input === 'owner')
        return 'admin';
    if (input === 'admin' || input === 'editor' || input === 'viewer')
        return input;
    return 'viewer';
};
exports.normalizeRole = normalizeRole;
const defaultPermissionsForRole = (role) => {
    if (role === 'viewer') {
        return {
            create: false,
            edit: false,
            delete: false,
            markDone: true,
            viewProgress: true,
        };
    }
    return {
        create: true,
        edit: true,
        delete: true,
        markDone: true,
        viewProgress: true,
    };
};
exports.defaultPermissionsForRole = defaultPermissionsForRole;
const getFamilyId = (req) => req.header('x-family-id')?.trim() || 'demo-family';
exports.getFamilyId = getFamilyId;
const getRequesterRole = (req) => (0, exports.normalizeRole)(req.header('x-user-role')?.trim() || 'viewer');
exports.getRequesterRole = getRequesterRole;
const getRequesterUserId = (req) => req.header('x-user-id')?.trim() || '';
exports.getRequesterUserId = getRequesterUserId;
const getRequesterPermissions = (req) => {
    const role = (0, exports.getRequesterRole)(req);
    const defaults = (0, exports.defaultPermissionsForRole)(role);
    return {
        create: normalizeBooleanHeader(req.header('x-perm-shopping-create')) ?? defaults.create,
        edit: normalizeBooleanHeader(req.header('x-perm-shopping-edit')) ?? defaults.edit,
        delete: normalizeBooleanHeader(req.header('x-perm-shopping-delete')) ?? defaults.delete,
        markDone: normalizeBooleanHeader(req.header('x-perm-shopping-mark-done')) ?? defaults.markDone,
        viewProgress: normalizeBooleanHeader(req.header('x-perm-shopping-view-progress')) ?? defaults.viewProgress,
    };
};
exports.getRequesterPermissions = getRequesterPermissions;
const errorResponse = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const requireAdminRole = (req, res, next) => {
    if ((0, exports.getRequesterRole)(req) !== 'admin') {
        errorResponse(res, 403, 'FORBIDDEN_ROLE', 'Only Admin can manage members.');
        return;
    }
    next();
};
exports.requireAdminRole = requireAdminRole;
const requireAuthenticatedUser = (req, res, next) => {
    if (!(0, exports.getRequesterUserId)(req)) {
        errorResponse(res, 400, 'INVALID_USER', 'Authenticated user id is required.');
        return;
    }
    next();
};
exports.requireAuthenticatedUser = requireAuthenticatedUser;
