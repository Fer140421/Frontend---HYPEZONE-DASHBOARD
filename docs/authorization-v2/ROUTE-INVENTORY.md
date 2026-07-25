# Inventario de rutas y permisos

Auditado el **2026-07-22** contra `src/app/app.routes.ts`.

El padre `/dashboard` usa `authGuard`. Cada hijo funcional usa `permissionGuard`, que espera estados transitorios y luego evalúa `permission`, `anyPermissions` o `allPermissions`. En las rutas actuales solo se usa `permission` simple.

| Ruta | PermissionKey | Estado | Archivo |
| --- | --- | --- | --- |
| `/dashboard/resumen` | `dashboard.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/lotes` | `lots.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/lotes/nuevo` | `lots.create` | COMPLETO | `app.routes.ts` |
| `/dashboard/lotes/:id/editar` | `lots.update` | COMPLETO | `app.routes.ts` |
| `/dashboard/lotes/:id` | `lots.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/productos` | `products.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/productos/nuevo` | `products.create` | COMPLETO | `app.routes.ts` |
| `/dashboard/productos/:id` | `products.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/ventas` | `sales.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/ventas/nueva` | `sales.create` | COMPLETO | `app.routes.ts` |
| `/dashboard/ventas/:id/editar` | `sales.update` | COMPLETO | `app.routes.ts` |
| `/dashboard/proveedores` | `providers.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/clientes` | `clients.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/catalogos` | `catalogs.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/marcas` | `catalogs.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/tallas` | `catalogs.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/configuracion` | `settings.view` | COMPLETO | `app.routes.ts` |
| `/dashboard/limpieza-productos` | `products.clean` | COMPLETO | `app.routes.ts` |
| `/dashboard/usuarios-permisos` | `users.view` + `userAuthorizationPendingChangesGuard` al salir | COMPLETO para frontend local | `app.routes.ts` |

## Usuarios y permisos

- La entrada del sidebar usa `users.view` y solo aparece cuando `AuthService.can('users.view')` retorna `true`.
- La ruta usa la misma clave y redirige a `/auth/access?reason=forbidden` si se deniega.
- La capacidad de editar dentro de la pantalla se evalúa aparte con `permissions.managePermissions`.
- Editar no crea una ruta hija: abre `UserAuthorizationEditDialogComponent` sobre el listado. Se eligió el patrón modal ya utilizado por otros módulos y se conserva `/dashboard/usuarios-permisos` como única URL.
- La ruta declara `canDeactivate: [userAuthorizationPendingChangesGuard]`, independiente del `authGuard` padre y de `permissionGuard`.
- Sin cambios pendientes el guard permite salir inmediatamente. Con dirty reutiliza un único diálogo: Permanecer cancela y conserva formulario/selección; Descartar y salir permite navegar sin llamar al servicio.
- La protección aplica a toda navegación gestionada por Angular Router: sidebar, `routerLink`, navegación programática y back cuando el Router lo intercepta. No se añadió `beforeunload`.
- El guard de ruta no convierte el listado local/mock en una integración segura. Solo controla navegación frontend.

## Cobertura y pendientes

Las pruebas directas de `permissionGuard` cubren espera durante loading, permiso simple, sesión no autenticada, denegación, `anyPermissions` y `allPermissions`. El spec del guard de cambios verifica delegación limpia/dirty y el spec de ruta confirma `permissionGuard`, `CanDeactivate`, `users.view` y lazy loading. El spec del layout verifica que Usuarios y permisos aparezca y desaparezca reactivamente con `users.view`.

Las acciones visibles y límites de método se detallan en [ACTION-INVENTORY.md](ACTION-INVENTORY.md). Un permiso `view` nunca implica permiso de escritura.
