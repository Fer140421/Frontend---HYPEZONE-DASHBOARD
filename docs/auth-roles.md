# Autenticación y roles — Arquitectura V2 (DEV / PROD)

Este documento describe el modelo de autenticación y autorización dinámica del proyecto HypeZone Dashboard.

---

## Modelo de Autorización V2

El sistema migró de roles estáticos hardcodeados a un modelo de **Autorización Dinámica Granular (Authorization V2)**:

1. **Identidad:** Manejada por Firebase Authentication.
2. **Perfiles:** Almacenados en la colección `users/{uid}` en Firestore.
3. **Roles como Documentos:** Almacenados en la colección `roles/{roleId}` (`owner`, `admin`, `seller`).
4. **Catálogo Tipado de Permisos:** Definido en `src/app/core/authorization/permission-catalog.ts` (17 permisos como `dashboard.view`, `users.view`, `products.create`, `permissions.managePermissions`, etc.).
5. **Overrides de Permisos:** Cada documento `users/{uid}` puede tener un objeto `permissionOverrides` con claves del catálogo asignadas a `true` (Permitir) o `false` (Denegar).
6. **Permisos Efectivos (`effectivePermissions`):** Mapa consolidado `Record<PermissionKey, boolean>` recalculado de forma autoritativa en el servidor (Cloud Functions) y materializado en el documento del usuario para ser consumido por Firestore Security Rules.

---

## Matriz de Roles y Permisos por Defecto

| Módulo / Permiso | Key | owner | admin | seller |
| --- | --- | --- | --- | --- |
| Ver Dashboard | `dashboard.view` | Sí | Sí | Sí |
| Ver Usuarios y Permisos | `users.view` | Sí | No | No |
| Crear Usuarios | `users.create` | Sí | No | No |
| Modificar Permisos | `permissions.managePermissions` | Sí | No | No |
| Ver Productos | `products.view` | Sí | Sí | Sí |
| Crear Productos | `products.create` | Sí | Sí | No |
| Modificar Productos | `products.update` | Sí | Sí | No |
| Eliminar Productos | `products.delete` | Sí | Sí | No |
| Limpiar Productos | `products.clean` | Sí | No | No |
| Ver Lotes | `lots.view` | Sí | Sí | No |
| Crear Lotes | `lots.create` | Sí | Sí | No |
| Modificar Lotes | `lots.update` | Sí | Sí | No |
| Eliminar Lotes | `lots.delete` | Sí | Sí | No |
| Ver Ventas | `sales.view` | Sí | Sí | Sí |
| Registrar Ventas | `sales.create` | Sí | Sí | Sí |
| Modificar Ventas | `sales.update` | Sí | Sí | No |
| Ver Clientes / Proveedores / Catálogos | `clients.*`, `providers.*`, `catalogs.*` | Sí | Sí | Según acción |

---

## Estructura del Documento `users/{uid}`

```ts
{
  uid: 'UID_FIREBASE_AUTH',
  email: 'usuario@example.com',
  displayName: 'Nombre Usuario',
  roleId: 'owner', // 'owner' | 'admin' | 'seller'
  active: true,
  permissionOverrides: {
    'products.delete': false // Override específico opcional
  },
  effectivePermissions: {
    'dashboard.view': true,
    'users.view': true,
    'permissions.managePermissions': true,
    // ...resto de permisos consolidados
  },
  protectedOwner: true, // Protege la cuenta principal de degradación o desactivación
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Estados de Sesión en `AuthService`

- `initializing` / `loading-profile`: Espera inicial mientras Firebase Auth y Firestore resuelven la sesión.
- `unauthenticated`: Sin usuario autenticado. Redirige a `/auth/login`.
- `missing-profile`: Autenticado en Auth pero no existe el documento `users/{uid}`.
- `inactive`: Perfil existente pero `active === false`. Acceso bloqueado.
- `error`: Error al consultar Firestore.
- `authenticated`: Sesión activa y perfil válido. Habilita los métodos `can()`, `canAny()`, `canAll()`.

---

## Seguridad y Servidor Privilegiado

- Ningún cliente Angular puede modificar directamente `/users/{uid}` (denegado en `firestore.rules`).
- Las mutaciones de rol, estado y permisos se realizan exclusivamente mediante las Cloud Functions `createUser` y `updateUserAuthorization` en `functions/src/index.ts` ejecutadas con Firebase Admin SDK.

El permiso `products.delete` permite ocultar productos `disponibles` mediante baja logica y gestionar
la restauracion de productos inactivos. Los productos `reservados` o `vendidos` estan protegidos y no
se pueden eliminar.
