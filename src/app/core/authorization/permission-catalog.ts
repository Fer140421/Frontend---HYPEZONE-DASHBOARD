import { UserRole } from '../models/user-profile.model';

export type PermissionModule = 'dashboard' | 'products' | 'lots' | 'providers' | 'clients' | 'sales' | 'catalogs' | 'settings' | 'users' | 'roles' | 'permissions';
export type CrudPermissionAction = 'view' | 'create' | 'update' | 'delete';
export type PermissionAction = CrudPermissionAction | 'clean' | 'managePermissions' | 'disable';
/**
 * The canonical persisted representation is a flat map. This union is intentionally
 * broad at the type boundary; runtime writes must still pass isPermissionKey().
 */
export type PermissionKey = `${PermissionModule}.${PermissionAction}`;

export interface PermissionDefinition {
  key: PermissionKey;
  module: PermissionModule;
  action: PermissionAction;
  label: string;
  description: string;
  order: number;
  sensitive: boolean;
  defaultRoles: readonly UserRole[];
}

const define = (definition: PermissionDefinition) => definition;
export const PERMISSION_CATALOG = [
  define({ key: 'dashboard.view', module: 'dashboard', action: 'view', label: 'Ver resumen', description: 'Acceder al resumen operativo.', order: 10, sensitive: false, defaultRoles: ['owner', 'admin', 'seller'] }),
  define({ key: 'products.view', module: 'products', action: 'view', label: 'Ver productos', description: 'Consultar productos.', order: 20, sensitive: false, defaultRoles: ['owner', 'admin', 'seller'] }),
  define({ key: 'products.create', module: 'products', action: 'create', label: 'Crear productos', description: 'Registrar productos.', order: 21, sensitive: false, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'products.update', module: 'products', action: 'update', label: 'Modificar productos', description: 'Editar producto y precio.', order: 22, sensitive: false, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'products.delete', module: 'products', action: 'delete', label: 'Eliminar productos', description: 'Desactivar productos.', order: 23, sensitive: true, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'products.clean', module: 'products', action: 'clean', label: 'Limpiar productos', description: 'Eliminar campos históricos.', order: 24, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'lots.view', module: 'lots', action: 'view', label: 'Ver lotes', description: 'Consultar lotes.', order: 30, sensitive: false, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'lots.create', module: 'lots', action: 'create', label: 'Crear lotes', description: 'Registrar lotes.', order: 31, sensitive: false, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'lots.update', module: 'lots', action: 'update', label: 'Modificar lotes', description: 'Editar y asociar lotes.', order: 32, sensitive: false, defaultRoles: ['owner', 'admin'] }),
  define({ key: 'lots.delete', module: 'lots', action: 'delete', label: 'Eliminar lotes', description: 'Desactivar lotes.', order: 33, sensitive: true, defaultRoles: ['owner', 'admin'] }),
  ...(['providers', 'clients'] as const).flatMap((module, index) => (['view', 'create', 'update', 'delete'] as const).map((action, actionIndex) => define({ key: `${module}.${action}`, module, action, label: `${action} ${module}`, description: `${action} ${module}.`, order: 40 + index * 10 + actionIndex, sensitive: action === 'delete', defaultRoles: module === 'clients' && action !== 'delete' ? ['owner', 'admin', 'seller'] : ['owner', 'admin'] }))),
  ...(['view', 'create', 'update', 'delete'] as const).map((action, index) => define({ key: `sales.${action}`, module: 'sales', action, label: `${action} sales`, description: `${action} sales.`, order: 60 + index, sensitive: action !== 'view', defaultRoles: action === 'create' ? ['owner', 'admin', 'seller'] : ['owner', 'admin'] })),
  ...(['view', 'create', 'update', 'delete'] as const).map((action, index) => define({ key: `catalogs.${action}`, module: 'catalogs', action, label: `${action} catalogs`, description: `${action} catalogs.`, order: 65 + index, sensitive: action === 'delete', defaultRoles: ['owner', 'admin'] })),
  define({ key: 'settings.view', module: 'settings', action: 'view', label: 'Ver configuración', description: 'Acceder a configuración.', order: 69, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'users.view', module: 'users', action: 'view', label: 'Ver usuarios', description: 'Listar usuarios administrativos.', order: 70, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'users.create', module: 'users', action: 'create', label: 'Crear usuarios', description: 'Crear cuentas administrativas.', order: 71, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'users.update', module: 'users', action: 'update', label: 'Modificar usuarios', description: 'Cambiar rol o estado.', order: 72, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'users.managePermissions', module: 'users', action: 'managePermissions', label: 'Gestionar permisos', description: 'Modificar overrides.', order: 73, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'users.disable', module: 'users', action: 'disable', label: 'Desactivar usuarios', description: 'Activar o desactivar cuentas administrativas.', order: 74, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'permissions.managePermissions', module: 'permissions', action: 'managePermissions', label: 'Gestionar autorizaciones', description: 'Modificar roles, estado y overrides de usuarios.', order: 75, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'roles.view', module: 'roles', action: 'view', label: 'Ver roles', description: 'Consultar roles.', order: 80, sensitive: true, defaultRoles: ['owner'] }),
  define({ key: 'roles.update', module: 'roles', action: 'update', label: 'Modificar roles', description: 'Modificar roles del sistema.', order: 81, sensitive: true, defaultRoles: ['owner'] }),
] as const satisfies readonly PermissionDefinition[];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((item) => item.key) as PermissionKey[];
export const ALL_PERMISSIONS = Object.freeze(Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]))) as Readonly<Record<PermissionKey, boolean>>;
export const isPermissionKey = (value: string): value is PermissionKey => PERMISSION_KEYS.includes(value as PermissionKey);
export function defaultPermissions(role: UserRole): Record<PermissionKey, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, role === 'owner' || PERMISSION_CATALOG.find((item) => item.key === key)!.defaultRoles.includes(role)])) as Record<PermissionKey, boolean>;
}
