export type UserRole = 'owner' | 'admin' | 'seller';

export const PERMISSION_KEYS = [
  'dashboard.view', 'products.view', 'products.create', 'products.update', 'products.delete', 'products.clean',
  'lots.view', 'lots.create', 'lots.update', 'lots.delete',
  'providers.view', 'providers.create', 'providers.update', 'providers.delete',
  'clients.view', 'clients.create', 'clients.update', 'clients.delete',
  'sales.view', 'sales.create', 'sales.update', 'sales.delete',
  'catalogs.view', 'catalogs.create', 'catalogs.update', 'catalogs.delete',
  'settings.view', 'users.view', 'users.create', 'users.update', 'users.managePermissions', 'users.disable',
  'permissions.managePermissions', 'roles.view', 'roles.update',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const OWNER_ONLY = new Set<PermissionKey>([
  'products.clean', 'settings.view', 'users.view', 'users.create', 'users.update',
  'users.managePermissions', 'users.disable', 'permissions.managePermissions', 'roles.view', 'roles.update',
]);
const SELLER = new Set<PermissionKey>([
  'dashboard.view', 'products.view', 'clients.view', 'clients.create', 'clients.update', 'sales.create',
]);

export function defaultPermissions(role: UserRole): Record<PermissionKey, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, role === 'owner' || (!OWNER_ONLY.has(key) && (role === 'admin' || SELLER.has(key)))])) as Record<PermissionKey, boolean>;
}
export function effectivePermissions(role: UserRole, rolePermissions: Partial<Record<PermissionKey, boolean>> = {}, overrides: Partial<Record<PermissionKey, boolean>> = {}): Record<PermissionKey, boolean> {
  return { ...defaultPermissions(role), ...rolePermissions, ...overrides };
}
export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

export function knownPermissions(value: unknown): Partial<Record<PermissionKey, boolean>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, enabled]) => isPermissionKey(key) && typeof enabled === 'boolean'),
  ) as Partial<Record<PermissionKey, boolean>>;
}
