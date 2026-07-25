# Documentación de Autorización V2 y Administración de Usuarios

Este directorio documenta la arquitectura de autorización dinámica y el módulo de **Administración → Usuarios y permisos** de HypeZone Dashboard.

Última actualización de auditoría: **2026-07-24**.

---

## Estado resumido del sistema

1. **Fundación Angular de Autorización:** Totalmente operativa. Incluye catálogo tipado de permisos (`permission-catalog.ts`), resolución de permisos efectivos (`resolveEffectivePermissions`), API reactiva en `AuthService` (`can()`, `canAny()`, `canAll()`), `permissionGuard` en rutas hijas, `authGuard` en el layout y filtrado dinámico del sidebar.
2. **Interfaz de Administración de Usuarios:**
   - Listado a ancho completo con Angular Material (`mat-table`, `MatPaginator`, filtros por texto, rol y estado).
   - Edición de rol, activo y `permissionOverrides` vía `MatDialog` (`UserAuthorizationEditDialogComponent`).
   - Creación de nuevos usuarios vía `MatDialog` (`UserCreateDialogComponent`).
   - Protección contra salida no guardada mediante `userAuthorizationPendingChangesGuard` (`CanDeactivate`).
   - Cobertura responsiva completa de 1440px a 320px.
   - Suite de 100 pruebas unitarias/integración pasando al 100%.
3. **Integración con Firestore (Lectura Real):**
   - `UserAuthorizationAdminService` observa la colección `users` de Firestore en tiempo real mediante `collectionData`.
   - Los datos mock de prueba (Ana, Bruno, Carla, Diego) fueron totalmente removidos del runtime ejecutable del servicio Angular.
4. **Cloud Functions Privilegiadas (Escritura en Servidor):**
   - Implementadas en TypeScript (`functions/src/index.ts`): `createUser` y `updateUserAuthorization`.
   - Utilizan Firebase Admin SDK para crear cuentas Auth, escribir perfiles en Firestore, recalcular `effectivePermissions` en servidor y aplicar reglas de protección al owner.
   - Conectadas en el frontend Angular mediante `httpsCallable`.
   - **Pendiente:** Ejecución en emuladores y despliegue remoto a Firebase.
5. **Firestore Security Rules:**
   - Versionadas en `firestore.rules` declarando acceso de lectura a `users` por `users.view` o propia UID, denegando mutaciones cliente directas y evaluando `effectivePermissions`.
   - **Pendiente:** Pruebas en emuladores y despliegue remoto.

---

## Guía de documentos en este directorio

1. [STATUS.md](STATUS.md): Estado detallado por funcionalidad y matriz de evidencias.
2. [ROADMAP.md](ROADMAP.md): Plan de fases A a G y criterios de aceptación.
3. [TODO.md](TODO.md): Lista ejecutable de tareas completadas y pendientes.
4. [DECISIONS.md](DECISIONS.md): Registro de decisiones arquitectónicas y de diseño.
5. [UI-USERS-PERMISSIONS.md](UI-USERS-PERMISSIONS.md): Especificación detallada de la pantalla de usuarios.
6. [IMPLEMENTACION-FASE-D-E.md](IMPLEMENTACION-FASE-D-E.md): Detalle técnico de la integración Firestore y Cloud Functions.
7. [AUDITORIA-FASE-D-E.md](AUDITORIA-FASE-D-E.md): Informe de auditoría pre-deploy de FASES D/E.
8. [ROUTE-INVENTORY.md](ROUTE-INVENTORY.md): Inventario completo de rutas protegidas y guards.
9. [ACTION-INVENTORY.md](ACTION-INVENTORY.md): Inventario de acciones y permisos requeridos.
