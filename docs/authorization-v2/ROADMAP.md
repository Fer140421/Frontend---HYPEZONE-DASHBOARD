# Roadmap corregido — Autorización V2

Secuencia y estado actualizado el **2026-07-24**.

---

## FASE A — Corregir UI y flujo local

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| A1 | Corregir estado inicial de selección | `dirty()` es falso sin selección; primer click establece usuario y carga formulario. | **COMPLETA** |
| A2 | Cambio de selección con cambios pendientes | Diálogo de confirmación al cambiar usuario si hay cambios sin guardar. | **COMPLETA** |
| A3 | Gate de edición en UI | Rol, activo y overrides gobernados por `permissions.managePermissions`. | **COMPLETA** |
| A4 | Flujo coherente de guardar/descartar | Botones, snackbar y resincronización funcionando correctamente. | **COMPLETA** |
| A5 | Protección local del owner | Owner protegido no puede ser desactivado ni degradado en la UI. | **COMPLETA** |

**Resultado FASE A:** Completada y verificada.

---

## FASE B — Responsive e integración visual

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| B1 | Reemplazar layout master/detail | Editor migrado a `MatDialog` (`UserAuthorizationEditDialogComponent`). Listado full-width. | **COMPLETA** |
| B2 | Paginación y filtros | `MatPaginator` integrado con `paginateItems()` (10, 25, 50) y reseteo al filtrar. | **COMPLETA** |
| B3 | Responsividad | 1440, 1024, 768, 600, 480 y 320 px probados sin overflow del body. | **COMPLETA** |
| B4 | Accesibilidad y tokens Material | Atributos ARIA, foco visible y tokens `--mat-sys-*`. | **COMPLETA** |

**Resultado FASE B:** Completada y verificada.

---

## FASE C — Pruebas del frontend y CanDeactivate

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| C1 | Pruebas de servicio y componente | Specs unitarios para adaptador local y componente UI (`100/100 SUCCESS`). | **COMPLETA** |
| C2 | Guard de salida `CanDeactivate` | `userAuthorizationPendingChangesGuard` protege contra navegación con cambios sin guardar. | **COMPLETA** |
| C3 | Pruebas de guards de ruta y sidebar | Cobertura para `permissionGuard` (simple, any, all) y sidebar reactivo. | **COMPLETA** |
| C4 | Eliminación de warnings Angular | Form controles sincronizados mediante API Reactive Forms sin `[disabled]`. | **COMPLETA** |

**Resultado FASE C:** Completada y verificada.

---

## FASE D — Integración real con backend (Lectura Firestore)

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| D1 | Modelos DTOs de autorización | `UserProfile`, `UpdateUserAuthorizationCommand` y `CreateUserCommand` tipados. | **COMPLETA** |
| D2 | Lectura Firestore en tiempo real | `UserAuthorizationAdminService` lee `collectionData('users')` via RxJS. | **COMPLETA** |
| D3 | Eliminación de fixtures mock en runtime | Ana, Bruno, Carla y Diego eliminados del servicio ejecutable (solo en specs). | **COMPLETA** |
| D4 | Paginación/ordenamiento backend futuro | Cursores backend (`startAfter`/`limit`) para grandes volúmenes de usuarios. | **PENDIENTE** |

**Resultado FASE D:** Parcial. Lectura real desde Firestore e interfaz UI conectadas; retirados mocks de runtime.

---

## FASE E — Cloud Functions (Escritura privilegiada)

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| E1 | Inicialización de proyecto Functions | `functions/` configurado con TypeScript, Node 22 y Firebase Admin SDK. | **COMPLETA** |
| E2 | Callable Function `createUser` | Crea Auth + Firestore, genera contraseña temporal y recalcula permisos. | **IMPLEMENTADO EN CÓDIGO** |
| E3 | Callable Function `updateUserAuthorization` | Transacción atómica en Firestore, recalcula `effectivePermissions` y sync Auth. | **IMPLEMENTADO EN CÓDIGO** |
| E4 | Modal UI de creación (`UserCreateDialogComponent`) | Diálogo Material para ingresar nombre, correo, rol, activo y overrides. | **COMPLETA** |
| E5 | Invariantes de seguridad en servidor | Protección contra auto-degradación y garantía de último owner activo. | **IMPLEMENTADO EN CÓDIGO** |
| E6 | Prueba en Firebase Emulator Suite | Validar las Functions contra emuladores Auth + Firestore locales. | **PENDIENTE** |
| E7 | Despliegue de Functions a DEV | Desplegar Functions a `hypezone-dev`. | **PENDIENTE** |

**Resultado FASE E:** Parcial. Código de Functions y frontend completados localmente; pendiente validación en emulador y despliegue.

---

## FASE F — Emulator y Rules v2

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| F1 | Reglas Security Rules v2 | `firestore.rules` valida `effectivePermissions` y bloquea escritura cliente a `/users/{uid}`. | **LISTO EN CÓDIGO** |
| F2 | Harness de pruebas con Emuladores | Suite automatizada contra Firebase Emulators para verificar denegaciones. | **PENDIENTE** |
| F3 | Matriz de permisos por rol | Probar `owner`, `admin`, `seller` sobre productos, lotes, ventas y clientes. | **PENDIENTE** |

**Resultado FASE F:** Pendiente de ejecución en emulador.

---

## FASE G — Deploy DEV, Pruebas Integrales y Deploy PROD

| ID | Objetivo | Criterio de aceptación | Estado |
| --- | --- | --- | --- |
| G1 | Verificación de alias DEV | Alias `dev` -> `hypezone-dev` configurado y verificado. | **COMPLETA** |
| G2 | Despliegue a DEV (`hypezone-dev`) | Deploy de Rules y Functions a DEV previa aprobación explícita. | **PENDIENTE** |
| G3 | Smoke tests end-to-end | Verificación de flujos reales con usuarios creados en DEV. | **PENDIENTE** |
| G4 | Despliegue a PROD (`hypezone-3ed2a`) | Deploy final a producción tras validación DEV exitosa. | **PENDIENTE** |

**Resultado FASE G:** Pendiente.

---

## Orden de ejecución obligatorio

`A (OK) → B (OK) → C (OK) → D (Parcial) → E (Parcial) → F (Pendiente) → G (Pendiente)`
