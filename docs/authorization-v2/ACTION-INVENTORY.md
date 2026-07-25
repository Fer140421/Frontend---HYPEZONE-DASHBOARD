# Inventario de permisos por acción

Auditado el **2026-07-22**. Este documento registra gates de UX/método; las Rules o Functions siguen siendo la autoridad requerida para operaciones sensibles.

## Módulos operativos

| Módulo | Acción visible | PermissionKey | Archivo | Cobertura directa |
| --- | --- | --- | --- | --- |
| Lotes | Crear lote | `lots.create` | `lotes.component.*` | `action-permissions.spec.ts` |
| Lotes | Editar, asociar/desvincular producto | `lots.update` | `lotes.component.*` | `action-permissions.spec.ts` |
| Lotes | Desactivar/reactivar | `lots.delete` | `lotes.component.*` | Gate template/método; sin prueba renderizada |
| Lotes | Crear producto desde lote | `products.create` | `lotes.component.*` | Gate de método; sin prueba renderizada |
| Ventas | Crear venta | `sales.create` | `ventas.component.*` | Gate de método; sin prueba renderizada |
| Ventas | Editar venta | `sales.update` | `ventas.component.*` | `action-permissions.spec.ts` |
| Ventas | Registrar cliente | `clients.create` | `ventas.component.*` | Gate de método; sin prueba renderizada |
| Clientes | Crear | `clients.create` | `clientes.component.*` | `action-permissions.spec.ts` |
| Clientes | Editar | `clients.update` | `clientes.component.*` | `action-permissions.spec.ts` |
| Clientes | Desactivar/reactivar | `clients.delete` | `clientes.component.*` | Gate template/método; sin prueba renderizada |
| Proveedores | Crear | `providers.create` | `proveedores.component.*` | `action-permissions.spec.ts` |
| Proveedores | Editar | `providers.update` | `proveedores.component.*` | `action-permissions.spec.ts` |
| Proveedores | Desactivar/reactivar | `providers.delete` | `proveedores.component.*` | Gate template/método; sin prueba renderizada |
| Categorías, marcas, tallas | Crear | `catalogs.create` | componentes respectivos | `action-permissions.spec.ts` |
| Categorías, marcas, tallas | Eliminar | `catalogs.delete` | componentes respectivos | `action-permissions.spec.ts` |

No existe UI de exportación, cancelación o eliminación física de ventas. Los catálogos no tienen control de edición; `catalogs.update` permanece reservado.

## Usuarios y permisos

| Acción | Gate actual | Estado | Archivo/método | Autoridad real |
| --- | --- | --- | --- | --- |
| Ver entrada del sidebar | `users.view` | COMPLETO | `dashboard-layout.component.ts` | UX solamente |
| Entrar a la ruta | `users.view` | COMPLETO | `app.routes.ts` | Guard frontend |
| Ver listado | `users.view` | CONECTADO A FIRESTORE | `UserAuthorizationAdminService.loadUsers()` | Firestore `collectionData('users')` |
| Pulsar lápiz | `select(user)` / `openEditor()` | COMPLETO | `UsuariosPermisosComponent.select()` | Abre `UserAuthorizationEditDialogComponent` en `MatDialog` |
| Crear usuario | `users.create` + `permissions.managePermissions` | IMPLEMENTADO LOCAL | `openCreateUser()` + `UserCreateDialogComponent` | Cloud Function `createUser` (`functions/src/index.ts`) via Admin SDK |
| Cambiar `roleId` | `permissions.managePermissions`; deshabilitado para owner protegido | COMPLETO EN UI / FUNCTION EN CÓDIGO | Form/dialog + `updateUserAuthorization` | Cloud Function `updateUserAuthorization` via Admin SDK |
| Cambiar `active` | `permissions.managePermissions`; deshabilitado para owner protegido | COMPLETO EN UI / FUNCTION EN CÓDIGO | Form/dialog + `updateUserAuthorization` | Cloud Function `updateUserAuthorization` via Admin SDK |
| Cambiar overrides | `permissions.managePermissions`; deshabilitados para owner protegido | COMPLETO EN UI / FUNCTION EN CÓDIGO | Form/dialog + `updateUserAuthorization` | Cloud Function `updateUserAuthorization` via Admin SDK |
| Ver permiso efectivo | No requiere gate adicional | COMPLETO | `effective()` / `effectivePermissions` | Servidor recalcula y entrega mapa |
| Cerrar editor limpio | Ningún gate adicional | COMPLETO | `UserAuthorizationEditDialogComponent.requestClose()` | Cierra modal y restaura foco |
| Cerrar editor dirty | Confirmación obligatoria | COMPLETO | diálogo de edición + `ConfirmDialogComponent` | Continuar editando o descartar y cerrar |
| Descartar | Requiere editor/dirty | COMPLETO | `discard()` | Restaura memoria del formulario |
| Guardar | `permissions.managePermissions`, dirty, no saving | IMPLEMENTADO LOCAL | `save()` | Invoca Cloud Function `updateUserAuthorization` |
| Confirmar guardado | Abre confirmación antes de enviar | COMPLETO | `UserAuthorizationConfirmDialogComponent` | Diálogo modal |
| Cambiar usuario con dirty | Dirty abre Cancelar/Descartar | COMPLETO | `select()` + `ConfirmDialogComponent` | UX |
| Abandonar ruta con dirty | `CanDeactivateFn` | COMPLETO | `userAuthorizationPendingChangesGuard` | Router Angular |
| Reintentar carga | `users.view` | COMPLETO | `retryLoadUsers(options)` | Reintento de suscripción RxJS a Firestore |

## Observaciones de política

- El catálogo contiene `users.update`, `users.disable`, `users.managePermissions` y `permissions.managePermissions`. La UI agrupa mutaciones bajo la última para la edición de privilegios.
- La protección del owner se valida de manera redundante: en la UI (deshabilitando controles) y de manera autoritativa en el servidor dentro de la Cloud Function `updateUserAuthorization` (impidiendo degradación propia o del último owner activo mediante transacciones Firestore).
- La suite completa cuenta con `100/100` pruebas pasando exitosamente.

