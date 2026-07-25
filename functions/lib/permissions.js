"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_KEYS = void 0;
exports.defaultPermissions = defaultPermissions;
exports.effectivePermissions = effectivePermissions;
exports.isPermissionKey = isPermissionKey;
exports.knownPermissions = knownPermissions;
exports.PERMISSION_KEYS = [
    'dashboard.view', 'products.view', 'products.create', 'products.update', 'products.delete', 'products.clean',
    'lots.view', 'lots.create', 'lots.update', 'lots.delete',
    'providers.view', 'providers.create', 'providers.update', 'providers.delete',
    'clients.view', 'clients.create', 'clients.update', 'clients.delete',
    'sales.view', 'sales.create', 'sales.update', 'sales.delete',
    'catalogs.view', 'catalogs.create', 'catalogs.update', 'catalogs.delete',
    'settings.view', 'users.view', 'users.create', 'users.update', 'users.managePermissions', 'users.disable',
    'permissions.managePermissions', 'roles.view', 'roles.update',
];
const OWNER_ONLY = new Set([
    'products.clean', 'settings.view', 'users.view', 'users.create', 'users.update',
    'users.managePermissions', 'users.disable', 'permissions.managePermissions', 'roles.view', 'roles.update',
]);
const SELLER = new Set([
    'dashboard.view', 'products.view', 'clients.view', 'clients.create', 'clients.update', 'sales.create',
]);
function defaultPermissions(role) {
    return Object.fromEntries(exports.PERMISSION_KEYS.map((key) => [key, role === 'owner' || (!OWNER_ONLY.has(key) && (role === 'admin' || SELLER.has(key)))]));
}
function effectivePermissions(role, rolePermissions = {}, overrides = {}) {
    return { ...defaultPermissions(role), ...rolePermissions, ...overrides };
}
function isPermissionKey(value) {
    return exports.PERMISSION_KEYS.includes(value);
}
function knownPermissions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value)
        .filter(([key, enabled]) => isPermissionKey(key) && typeof enabled === 'boolean'));
}
