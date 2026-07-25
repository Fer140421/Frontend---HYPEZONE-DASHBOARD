# Implementación FASE D + creación de usuarios

Actualizado: 2026-07-23. Alcance local DEV; no se realizó deploy.

## Frontend

- `UserAuthorizationAdminService` observa la colección `users` de Firestore y normaliza perfiles incompletos.
- La tabla conserva búsqueda, filtros y paginación cliente sobre los usuarios reales.
- `Guardar` invoca `updateUserAuthorization` mediante `httpsCallable` y actualiza la lista con la respuesta del servidor.
- `Nuevo usuario` abre `UserCreateDialogComponent` con nombre, correo, rol, estado y la matriz completa de overrides.
- La creación no usa `createUserWithEmailAndPassword`; el owner no pierde su sesión.

## Functions

`functions/src/index.ts` contiene dos callable Functions para DEV:

- `createUser`: exige owner activo, valida datos y permisos, genera contraseña temporal, crea Firebase Authentication, crea `users/{uid}` con `roleId`, `active`, `permissionOverrides`, `effectivePermissions` y `protectedOwner: false`, y devuelve el usuario creado junto con la contraseña temporal.
- `updateUserAuthorization`: exige owner activo, valida overrides, recalcula permisos en servidor, sincroniza el estado de Authentication y protege el owner/último owner contra degradación.

Las dependencias y el emulador Functions están configurados en `functions/`, `firebase.json` y `package.json`. Las escrituras directas de `users` están denegadas en `firestore.rules`; las mutaciones administrativas pasan por Admin SDK.

## Verificación

- `npm run build:dev`: PASS.
- `npm --prefix functions run build`: PASS.
- `npm test -- --watch=false --browsers=ChromeHeadless`: PASS, 100/100.
- No se hizo deploy ni se modificó PROD.

## Pendiente antes de usarlo en DEV remoto

Ejecutar los emuladores Auth/Firestore/Functions y validar callable, Rules, duplicados de correo, último owner y entrega segura de la contraseña temporal. Después se requiere autorización explícita separada para desplegar únicamente a `hypezone-dev`.
