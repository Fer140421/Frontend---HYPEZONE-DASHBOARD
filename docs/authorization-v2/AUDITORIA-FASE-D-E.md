# Auditoría FASE D/E pre-deploy

Fecha: 2026-07-23. Alcance estático local. No se consultó ni modificó Firebase y no se hizo deploy.

## Resultado

Se encontraron y corrigieron cuatro inconsistencias:

1. `createUser` y `updateUserAuthorization` ahora exigen autenticación, perfil owner activo y `permissions.managePermissions` efectivo. El cliente no es la autoridad.
2. El catálogo de Functions quedó alineado con Angular: `seller` no recibe `sales.view` por defecto.
3. Los permisos provenientes de `roles/{roleId}` se filtran contra el catálogo conocido y el último-owner considera tanto `roleId` como el campo legacy `role`.
4. El editor administrativo ya no calcula `effectivePermissions` con defaults locales; muestra únicamente el mapa materializado por servidor.

## Angular

La pantalla administrativa solo usa `collectionData` para leer `users` y `httpsCallable` para crear/actualizar. No hay `addDoc`, `setDoc`, `updateDoc` ni `deleteDoc` en el flujo de usuarios. `createUserWithEmailAndPassword` no aparece en el runtime.

El cálculo de permisos de `AuthService` continúa siendo una decisión de UX/guards de sesión; no se usa para autorizar Functions ni para persistir `effectivePermissions`. Las mutaciones administrativas reciben su autorización del servidor.

## Functions

`functions/src/index.ts` valida tipos, rol, correo, overrides conocidos, actor autenticado, owner activo y `permissions.managePermissions`. `createUser` crea Auth y Firestore desde Admin SDK; `updateUserAuthorization` recalcula permisos en servidor, sincroniza el estado Auth y protege auto-degradación, owner protegido y último owner.

## Rules

`firestore.rules` deniega toda escritura cliente en `users` y usa `effectivePermissions` materializado para las colecciones de negocio. La colección `roles` solo se puede leer con sesión activa y no se puede escribir desde cliente. Las Functions usan Admin SDK, por lo que no dependen de permitir escrituras directas.

## Bloqueo antes de deploy

Antes de desplegar DEV se debe ejecutar una migración/seed que garantice que cada perfil activo tenga `effectivePermissions` completo y correcto. Las Rules ya no hacen fallback a `role` para autorizar operaciones; desplegar sin materializar esos mapas puede producir denegaciones, no una elevación de privilegios.

## Verificación

- `npm run build:dev`: PASS.
- `npm --prefix functions run build`: PASS.
- `npm test -- --watch=false --browsers=ChromeHeadless`: ejecutar nuevamente después de esta auditoría.
