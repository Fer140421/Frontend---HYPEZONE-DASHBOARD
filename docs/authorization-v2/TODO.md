# TODO y tareas pendientes — Autorización V2

Última actualización: **2026-07-24**.

---

## FASE A — UI y flujo local

- [x] Hacer que `dirty()` sea `false` cuando no existe selección/original.
- [x] Normalizar `roleId`, `active` y `permissionOverrides` sin `undefined`, con orden estable por `PERMISSION_KEYS`.
- [x] Verificar que el lápiz seleccione, cargue el formulario y abra el panel/diálogo.
- [x] Cambiar inmediatamente de usuario cuando no existen cambios.
- [x] Confirmar con Cancelar/Descartar y continuar cuando existen cambios pendientes.
- [x] Mantener `permissions.managePermissions` como gate de UI sin añadir checks rígidos por rol.
- [x] Verificar Guardar, Descartar, confirmación, snackbar y resincronización de dirty.
- [x] Impedir confirmaciones/llamadas duplicadas durante un save pendiente.
- [x] Conservar el estado editado si el guardado falla.
- [x] Mantener protección local del owner y validaciones en la interfaz.

---

## FASE B — Responsive e integración visual

- [x] No reservar espacio innecesario cuando `selected()` es `null`.
- [x] Reemplazar el layout master/detail por un editor modal `MatDialog` (`UserAuthorizationEditDialogComponent`) para mantener la alineación visual con Productos, Clientes y Proveedores.
- [x] Añadir `.table-scroll` para contener el desplazamiento horizontal de la tabla sin overflow del body.
- [x] Incorporar `MatPaginator` local sobre los resultados filtrados con opciones `10`, `25`, `50` y reseteo de página al filtrar.
- [x] Alinear cabecera, filtros, tabla, estados vacíos/error/cargando y botones Material.
- [x] Validar responsividad a 1440, 1024, 768, 600, 480 y 320 px sin overflow del body ni botones cortados.
- [x] Garantizar accesibilidad: `aria-label`/`aria-pressed` en acciones, `aria-selected` en filas, foco visible y restauración de foco al cerrar diálogos.
- [x] Estilar el diálogo utilizando tokens `--mat-sys-*` de Angular Material.
- [x] Evitar cierre accidental del diálogo dirty desactivando `disableClose: true` y exigiendo confirmación de descarte.

---

## FASE C — Pruebas del frontend y CanDeactivate

- [x] Crear pruebas unitarias para el servicio de administración `UserAuthorizationAdminService`.
- [x] Crear pruebas para `UsuariosPermisosComponent` (búsqueda, filtros, paginación, selección, formulario, etc.).
- [x] Cubrir el bug de selección inicial con una prueba de regresión.
- [x] Cubrir la paginación posterior a filtros y el reset a la primera página.
- [x] Cubrir el manejo de loading/error/retry.
- [x] Cubrir cambios de rol, estado y overrides en las acciones de guardar/descartar.
- [x] Probar los overrides Heradar (`inherit`), Permitir (`allow`) y Denegar (`deny`) y la visualización de permisos efectivos.
- [x] Implementar el guard `userAuthorizationPendingChangesGuard` (`CanDeactivate`) y probar protección al salir de la ruta.
- [x] Cubrir `permissionGuard` con claves simples, `anyPermissions` y `allPermissions`.
- [x] Probar visibilidad reactiva de la entrada "Usuarios y permisos" en el sidebar.
- [x] Eliminar warnings de formularios reactivos controlando el estado `disabled` vía `FormControl`.
- [x] Ejecutar build DEV, build PROD y suite completa de pruebas (`100/100 SUCCESS`).

---

## FASE D — Integración frontend real (Lectura Firestore)

- [x] Definir modelos DTOs de perfil administrativo (`UserProfile`) y comandos de mutación (`UpdateUserAuthorizationCommand`, `CreateUserCommand`).
- [x] Conectar `UserAuthorizationAdminService` a la colección `users` de Firestore en tiempo real (`collectionData`).
- [x] Conectar loading/error/retry a la lectura en tiempo real de Firestore con RxJS.
- [x] Eliminar los fixtures hardcodeados (Ana, Bruno, Carla, Diego) del runtime del servicio Angular.
- [x] Mantener paginación, filtrado y ordenamiento cliente sobre los usuarios reales de Firestore.
- [ ] Implementar paginación backend mediante cursores (`startAfter` / `limit`) si el número de usuarios en Firestore crece considerablemente.
- [ ] Enriquecer el listado con información extendida de Firebase Authentication si existen cuentas sin documento en Firestore.

---

## FASE E — Cloud Functions (Escritura privilegiada)

- [x] Inicializar proyecto `functions/` con TypeScript y Firebase Admin SDK (`package.json`, `tsconfig.json`, `index.ts`).
- [x] Implementar callable Function `createUser` para crear usuario en Auth + Firestore con contraseña temporal y recálculo de `effectivePermissions`.
- [x] Implementar callable Function `updateUserAuthorization` para mutaciones atómicas vía transacciones Firestore.
- [x] Validar que las claves de overrides pertenezcan al catálogo tipado (`PERMISSION_KEYS`).
- [x] Implementar el recálculo autoritativo de `effectivePermissions` en servidor combinando el rol (`roles/{roleId}`) y los overrides.
- [x] Imponer protección contra auto-degradación de privilegios del actor autenticado y del owner protegido.
- [x] Imponer la regla de negocio que garantiza la existencia de al menos un owner activo en el sistema.
- [x] Crear el componente modal de creación de usuarios (`UserCreateDialogComponent`) en el frontend Angular.
- [x] Conectar `openCreateUser()` y `save()` en el servicio Angular a las callable Cloud Functions (`httpsCallable`).
- [ ] Ejecutar y validar las Cloud Functions en Firebase Emulator Suite.
- [ ] Desplegar las Cloud Functions al proyecto de desarrollo `hypezone-dev`.

---

## FASE F — Emulator Suite y Security Rules v2

- [x] Escribir la especificación de `firestore.rules` utilizando `effectivePermissions` y denegando la mutación cliente directa sobre `/users/{uid}`.
- [ ] Configurar el entorno de Firebase Emulators (`auth`, `firestore`, `functions`) en `firebase.json`.
- [ ] Crear la suite de pruebas automatizadas para validar las Rules v2 contra el emulador de Firestore.
- [ ] Probar intentos de escalación de privilegios directa desde cliente (deben ser rechazados por Firestore Rules).
- [ ] Probar transacciones de venta, productos, clientes y proveedores con usuarios de diferentes roles (`owner`, `admin`, `seller`).

---

## FASE G — Deploy DEV, Pruebas Integrales y Deploy PROD

- [ ] Verificar el alias de entorno `dev` -> `hypezone-dev` en `.firebaserc` y archivos de environment.
- [ ] Ejecutar migración/seed de roles y `effectivePermissions` en `hypezone-dev`.
- [ ] Desplegar Security Rules y Cloud Functions exclusivamente al proyecto `hypezone-dev`.
- [ ] Ejecutar smoke tests end-to-end en el entorno `hypezone-dev` (crear usuario, modificar permisos, probar accesos con la cuenta creada).
- [ ] Obtener autorización explícita y realizar el despliegue final al proyecto de producción `hypezone-3ed2a`.
