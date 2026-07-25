# Decisiones

## D-001: Mapa plano de permisos

La representación canónica es `Record<PermissionKey, boolean>`, por ejemplo `{ "products.view": true }`. Un override ausente hereda el rol; `true` concede y `false` deniega. El catálogo es la única fuente de claves válidas.

## D-002: Roles como documentos

Los roles se representan con `roles/{roleId}` y contienen `active`, `system` y un mapa de permisos. Los perfiles usan `roleId`; el campo legacy `role` se lee durante la transición.

## D-003: Fallar cerrado mientras se carga el rol

`authenticated` solo se emite después de resolver perfil activo y documento de rol activo. Perfil/rol ausente o inactivo y errores de Firestore son estados distintos.

## D-004: Permisos materializados como destino de Rules

La arquitectura objetivo materializa `effectivePermissions` en `users/{uid}` desde Cloud Functions privilegiadas cuando cambia rol u overrides. Las Rules podrán hacer una lectura del perfil. El cálculo Angular actual sirve para UX y no es autoridad.

## D-005: El cliente no administra campos sensibles directamente

`roleId`, `active`, `protectedOwner`, `permissionOverrides` y `effectivePermissions` deben escribirse mediante callable Functions. Las Rules futuras deben rechazar mutación directa del cliente.

## D-006: Invariantes del owner protegido en Admin SDK

Las Rules no garantizan de forma segura el último owner. Functions/Admin SDK deben impedir desactivación, downgrade, pérdida del último owner protegido y autoescalación no autorizada.

## D-007: Migración completa de rutas

Todos los hijos actuales del dashboard usan `permissionGuard`; `roleGuard` fue eliminado al quedar sin consumidores. El `authGuard` padre distingue validez de sesión de denegación por permiso.

## D-008: Catálogos comparten nivel administrativo actual

Categorías, marcas y tallas comparten `catalogs.create` y `catalogs.delete`. `catalogs.update` queda reservado hasta que exista edición real. No se agregan permisos de venta para acciones inexistentes.

## D-009: Separar acceso de lectura y capacidad de edición administrativa

La ruta y el sidebar de Usuarios y permisos requieren `users.view`. La implementación actual usa `permissions.managePermissions` para habilitar rol, estado, overrides y save. Esta separación se conserva como hecho auditado, pero antes de conectar backend se debe decidir si `users.update`, `users.disable` y `users.managePermissions` gobiernan controles específicos. No se asume que `users.view` permita editar.

## D-010: Transición desde prototipo mock hacia integración Firestore / Cloud Functions (FASE D/E)

Inicialmente `UserAuthorizationAdminService` se clasificó como un adaptador local/mock. Durante las FASES D y E, se retiraron los fixtures hardcodeados (Ana, Bruno, Carla, Diego) del runtime ejecutable del servicio y se conectó la lectura en tiempo real con Firestore (`collectionData`). Las mutaciones de actualización y creación de usuarios se delegaron a callable Cloud Functions (`updateUserAuthorization` y `createUser`), manteniendo la UI protegida por el Admin SDK en servidor.

## D-011: El lápiz está bloqueado por `dirty()` inicial

La causa histórica quedó confirmada por código: sin selección, `command()` devolvía un comando vacío no igual a `original() === null`; por ello `dirty()` era verdadero y `select()` retornaba antes de establecer el usuario. FASE A corrigió la regresión. El panel inline que entonces existía bajo `@if (selected(); as user)` fue retirado posteriormente por D-020 y no forma parte del template actual.

## D-012: La compresión es una pista grid vacía

La grilla local definía siempre dos columnas `minmax(320px,1fr) minmax(420px,2fr)`. Cuando el panel no se renderizaba, la pista derecha permanecía y el listado ocupaba solo la izquierda. El contenedor global acepta hasta 1440 px y no era la causa. FASE B lo resolvió inicialmente con master/detail condicional; D-020 sustituye ese patrón por listado siempre full-width y editor modal.

## D-013: La vista efectiva administrativa debe usar la misma fuente de verdad del backend

El método UI `effective()` usa defaults del catálogo más overrides locales y no consume el documento real de rol ni el campo materializado del usuario. Puede coincidir con los roles sembrados hoy, pero no soporta roles modificados. La integración real debe devolver o resolver una representación autoritativa y explicar su origen.

## D-014: Evidencia remota y evidencia del repositorio se registran por separado

El seed aplicado, roles creados, owner migrado, login y acceso DEV se aceptan como contexto operativo confirmado. Esta auditoría no consultó Firebase y no transforma ese antecedente en una verificación remota nueva. Las afirmaciones sobre código, build y tests sí fueron verificadas localmente.

## D-015: Orden de implementación A → G

Primero se corrige el flujo local, luego responsive/integración visual y pruebas frontend; después se conecta backend, se implementan Functions, se validan Rules en emulador y finalmente se considera deploy DEV con autorización separada. No se conecta persistencia real sobre un editor inaccesible ni se despliega seguridad sin pruebas de emulador.

## D-016: Simulaciones explícitas en el adaptador local

Mientras la pantalla continúe mock, `loadUsers(options?: UserAuthorizationLoadOptions)` admite `delayMs`, `simulateFailure` y `simulateEmpty`. Las opciones son infraestructura de desarrollo/prueba, no parámetros del futuro contrato Firebase. Cada carga devuelve copias, preserva fixtures canónicos, limpia error al iniciar y usa `finalize` para cerrar loading. No se introduce HTTP ni Firebase para simular fallos.

## D-017: Proteger salida mediante CanDeactivate, sin beforeunload

`/dashboard/usuarios-permisos` registra un `CanDeactivateFn<UsuariosPermisosComponent>` separado de autenticación y `permissionGuard`. Si dirty es falso permite salir; si es verdadero reutiliza `ConfirmDialogComponent` con Permanecer y Descartar y salir. Navegaciones repetidas comparten la misma confirmación para evitar diálogos duplicados. No se intercepta el cierre de pestaña porque el proyecto no tiene un patrón aprobado de `beforeunload`.

## D-018: El estado disabled pertenece a Reactive Forms

Los controles `roleId` y `active` se crean deshabilitados y se habilitan/deshabilitan mediante su API según `permissions.managePermissions` y `protectedOwner`. El template no usa `[disabled]` sobre esos controles. Esto elimina el warning de Angular Material sin cambiar las restricciones locales del owner.

## D-019: Evidencia responsive exacta sin incorporar un framework E2E

La FASE C usa el navegador instalado y Chrome DevTools Protocol para fijar viewports reales de 1440, 1024, 768, 560, 480 y 320 px. Se verifican dimensiones del body, contención de tabla/paginator, posición del editor, matriz, acciones y diálogo. El arnés temporal no queda en el repositorio porque el proyecto no tenía infraestructura E2E y no se incorpora un framework nuevo solo para esta fase.

## D-020: Edición de Usuarios y permisos mediante MatDialog

El master/detail se reemplaza por `UserAuthorizationEditDialogComponent`. Esta opción coincide con Productos, Clientes y Proveedores, mantiene el contexto del listado y evita una ruta adicional para datos que todavía son memoria local. El listado permanece full-width; la fila seleccionada conserva identificación visual.

El diálogo usa `width: min(960px, 96vw)`, `maxWidth: 96vw`, `maxHeight: 92vh`, título Material, contenido desplazable y acciones separadas. Sus estilos propios usan tokens `--mat-sys-*`; los breakpoints del listado se alinean con los globales de 900 y 600 px. En móvil, el host se organiza en título/contenido/acciones para que los botones no queden fuera del viewport.

`disableClose: true` evita pérdida implícita por backdrop/Escape. Cerrar dirty reutiliza `ConfirmDialogComponent`; guardar exitoso cierra el editor y un error lo mantiene abierto. `CanDeactivate` continúa protegiendo la navegación de ruta. La decisión no cambia el carácter LOCAL/MOCK ni autoriza integración backend.

## D-021: Administración de usuarios mediante Cloud Functions v2 (Admin SDK)

Para garantizar la seguridad y atrocidad de las mutaciones de usuarios (`roleId`, `active`, `permissionOverrides`, `effectivePermissions`), el cliente Angular no realiza escrituras directas sobre Firestore (`setDoc`, `updateDoc`). Se implementan dos Cloud Functions v2 (`createUser` y `updateUserAuthorization`) en `functions/src/index.ts`. Las funciones validan la autenticación del autor, la tenencia del permiso `permissions.managePermissions`, protegen al owner contra degradación/desactivación propia o de último owner activo, y calculan autoritativamente el mapa `effectivePermissions` en el servidor antes de guardar. La creación de usuarios se apoya en `UserCreateDialogComponent` y genera una contraseña temporal enviada en la respuesta de la callable Function.
