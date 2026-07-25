# Estado actual del proyecto — Autorización V2

**Auditoría técnica realizada:** 2026-07-24.

## Resumen ejecutivo

El sistema de autorización dinámica de HypeZone Dashboard se encuentra en un estado de desarrollo avanzado sobre el entorno **DEV** (`hypezone-dev`).

- **Fases A, B y C:** COMPLETAS Y VERIFICADAS. El frontend local cuenta con UI moderna Angular Material, edición en `MatDialog`, creación de usuarios en modal, tabla full-width, paginación, filtros/búsqueda, protección de cambios pendientes (`CanDeactivate`), responsividad exacta (1440px a 320px), y suite de 100 pruebas unitarias/integración pasando al 100%.
- **Fase D:** PARCIAL. La lectura de usuarios está conectada en tiempo real a Firestore (`collectionData('users')`). Los datos mock hardcodeados (Ana, Bruno, Carla, Diego) fueron completamente eliminados del runtime del servicio `UserAuthorizationAdminService` y relegados únicamente a dobles de prueba (`spec`). La búsqueda, filtrado y paginación operan sobre los documentos reales de Firestore.
- **Fase E:** PARCIAL. Las Cloud Functions privilegiadas (`createUser` y `updateUserAuthorization`) están implementadas en TypeScript (`functions/src/index.ts`), compiladas y conectadas en el frontend Angular (`httpsCallable`). `createUser` incluye la generación de contraseña temporal y creación en Auth + Firestore; `updateUserAuthorization` ejecuta transacciones atómicas, recalcula `effectivePermissions` en servidor y protege contra auto-degradación y degradación del owner. **Sin embargo, las Functions aún no han sido validadas en emuladores ni desplegadas a Firebase.**
- **Fase F:** PENDIENTE. Las reglas de seguridad `firestore.rules` contienen la estructura v2 con `effectivePermissions` y bloqueo de escrituras directas a `users/{uid}`, pero resta ejecutar y validar la suite completa de pruebas con Firebase Emulator Suite.
- **Fase G:** PENDIENTE. Despliegue DEV, smoke tests finales y despliegue a PROD (`hypezone-3ed2a`).

---

## Fundación de autorización

| Pieza | Estado | Evidencia y ubicación |
| --- | --- | --- |
| Catálogo tipado de permisos | COMPLETO | `src/app/core/authorization/permission-catalog.ts` define 17 permisos, descripciones, claves conocidas e `isPermissionKey()`. |
| Resolución efectiva | COMPLETO | `resolveEffectivePermissions()` en frontend (`AuthService`) y `effectivePermissions()` en servidor (`functions/src/permissions.ts`). |
| Sesión y Perfil | COMPLETO | `AuthService` resuelve Firebase Auth → `users/{uid}` → `roles/{roleId}` y expone signals reactivas y estados de sesión (`authenticated`, `inactive`, `missing-profile`, etc.). |
| API de permisos | COMPLETO | `AuthService.can()`, `canAny()`, `canAll()` y `hasModuleAccess()` operan reactivamente en toda la app. |
| Guards de rutas | COMPLETO | `/dashboard` utiliza `authGuard` y todas las rutas hijas utilizan `permissionGuard` declarativo con la clave requerida. |
| Sidebar dinámico | COMPLETO | `DashboardLayoutComponent` filtra ítems de navegación según `auth.can(item.permission)`. |
| Datos DEV de roles/owner | COMPLETO (en DEV) | `scripts/seed-firebase-dev-roles.cjs` crea `roles/owner`, `roles/admin`, `roles/seller` y configura el owner inicial en `hypezone-dev`. |
| Rules de Firestore | PARCIAL / LISTO EN CÓDIGO | `firestore.rules` restringe la lectura de `users` a `users.view` o propia UID, deniega escrituras directas a `/users/{uid}`, permite lectura de `roles` y evalúa `effectivePermissions` para colecciones de negocio. |
| Backend privilegiado | IMPLEMENTADO LOCAL / PENDIENTE DEPLOY | `functions/src/index.ts` contiene `createUser` y `updateUserAuthorization` con Firebase Admin SDK. Pendiente prueba en emulador y despliegue. |

---

## Matriz de estado de Usuarios y permisos

| Funcionalidad | Clasificación | Estado real y evidencia |
| --- | --- | --- |
| Acceso por `users.view` | COMPLETO | Ruta `/dashboard/usuarios-permisos` protegida con `permissionGuard`; sidebar filtrado dinámicamente. |
| Edición por `permissions.managePermissions` | COMPLETO | Formulario y matriz controlados por permiso de gestión y deshabilitados para owner protegido. |
| Listado de usuarios | COMPLETO | `UserAuthorizationAdminService.users` expone la lista leída directamente desde Firestore via RxJS/Signals. |
| Usuarios reales | CONECTADO | Lectura en tiempo real sobre `collectionData(collection(firestore, 'users'))`. |
| Búsqueda por texto | COMPLETO | Filtra `displayName` y `email` sobre la signal de usuarios reales en cliente. |
| Filtro por rol | COMPLETO | Filtra por `roleId ?? role` en cliente. |
| Filtro por estado | COMPLETO | Filtra por `active` (todos, activos, inactivos) en cliente. |
| Limpiar filtros | COMPLETO | Restablece búsqueda, filtro de rol y estado active a sus valores por defecto. |
| Loading / Error / Retry | COMPLETO | `UserAuthorizationAdminService.loadUsers()` gestiona `loading` y `error` reactivamente ante Firestore. |
| Selección de usuario | COMPLETO | `select(user)` establece la selección, sincroniza formulario y abre el diálogo de edición. |
| Lápiz de edición | COMPLETO | Botón de la tabla abre `UserAuthorizationEditDialogComponent` en `MatDialog`. |
| Editor `MatDialog` | COMPLETO | Modal responsive (`min(960px, 96vw)`, `92vh`) con título Material, matriz desplazable y acciones dirty fijas. |
| Creación de usuarios (`Nuevo usuario`) | IMPLEMENTADO LOCAL | `openCreateUser()` abre `UserCreateDialogComponent` y llama `createUser` via `httpsCallable`. Muestra contraseña temporal producida por Admin SDK. Pendiente despliegue de Function. |
| Actualización de autorización | IMPLEMENTADO LOCAL | `save()` invoca `updateUserAuthorization` via `httpsCallable` enviando UID, rol, activo y overrides. Pendiente despliegue de Function. |
| `permissionOverrides` | COMPLETO | Selección Heradar (`inherit`), Permitir (`allow`), Denegar (`deny`) con normalización en orden del catálogo. |
| Vista de permisos efectivos | COMPLETO | Muestra los permisos consolidados del usuario seleccionado en el diálogo. |
| Guardar / Descartar | COMPLETO | Guardar valida dirty/form y pide confirmación. Descartar restaura valores originales. |
| Confirmación al guardar | COMPLETO | `UserAuthorizationConfirmDialogComponent` muestra resumen de rol, estado y overrides antes de enviar. |
| Protection del owner | COMPLETO | UI e Invariantes en Function bloquean degradación/desactivación del owner y del último owner activo. |
| `CanDeactivate` | COMPLETO | `userAuthorizationPendingChangesGuard` protege la navegación Router ante cambios sin guardar. |
| Responsividad UI | COMPLETO | Probado visualmente y por CDP en 1440, 1024, 768, 600, 480 y 320 px sin overflow horizontal del body. |
| Pruebas unitarias | COMPLETO | `100/100 SUCCESS` en Chrome Headless (componente, diálogo de edición, repositorio/servicio, guards y sidebar). |
| Cloud Functions | IMPLEMENTADO EN CÓDIGO | `functions/src/index.ts` listo y compilable con TypeScript. Pendiente validación Emulator y Deploy. |
| Firestore Security Rules | IMPLEMENTADO EN CÓDIGO | `firestore.rules` listo en el repositorio. Pendiente validación Emulator y Deploy. |

---

## Verificación de compilación y pruebas local

- **Build Frontend DEV (`npm run build:dev`):** PASS sin errores.
- **Build Frontend PROD (`npm run build:prod`):** PASS con budgets documentados.
- **Build Functions (`npm --prefix functions run build`):** PASS sin errores de compilación TypeScript.
- **Pruebas unitarias frontend (`npm test`):** PASS `100/100 SUCCESS` en Chrome Headless.
