# UI — Usuarios y permisos

Estado de `/dashboard/usuarios-permisos` actualizado el **2026-07-22** tras verificar las FASES A, B y C. Este documento describe el frontend local/mock observado, no una promesa de integración backend.

> Estado vigente: consultar `AUDITORIA-FASE-D-E.md`. Las referencias históricas a mock corresponden a FASES A-C; el runtime actual usa Firestore y callable Functions.

## Objetivo de la pantalla

Permitir a un actor autorizado listar usuarios administrativos, buscar/filtrar, inspeccionar rol y permisos efectivos, proponer cambios de rol/estado/overrides, revisar un resumen y guardar mediante un backend privilegiado. La UI debe separar claramente lectura (`users.view`) de mutación y nunca escribir campos sensibles directamente en Firestore.

## Arquitectura prevista

```text
Route + authGuard(parent) + permissionGuard(users.view)
        └─ CanDeactivate para cambios pendientes
        ↓
UsuariosPermisosComponent
        ↓ adaptador Angular tipado
        ├─ lectura paginada de users/{uid} (o callable si requiere datos de Auth)
        └─ escritura: callable autenticada → Cloud Function / Admin SDK
        ↓
recalcular y materializar effectivePermissions
        ↓
Rules v2: negar escrituras sensibles desde cliente
```

El backend debe validar actor, usuario destino, rol, estado, catálogo de claves, owner protegido, último owner y autoescalación. El cliente no debe enviar un mapa efectivo confiable; debe recibir el resultado autoritativo.

## Estado real

```text
Route + permissionGuard(users.view) + CanDeactivate    COMPLETO
        ↓
UsuariosPermisosComponent                             FRONTEND VERIFICADO
        ├─ listado Material full-width
        ├─ UserAuthorizationEditDialogComponent       EDITOR MODAL
        └─ UserCreateDialogComponent                  MODAL NUEVO USUARIOS
        ↓
UserAuthorizationAdminService                         CONECTADO A FIRESTORE / CALLABLES
        ├─ Lectura en tiempo real                     collectionData('users')
        ├─ Actualización                              httpsCallable('updateUserAuthorization')
        └─ Creación                                   httpsCallable('createUser')
        ↓
Cloud Functions (TypeScript en functions/src/index.ts) IMPLEMENTADO EN CÓDIGO (PENDIENTE DEPLOY)
        ├─ createUser                                 Auth.createUser + Firestore doc + effectivePermissions
        └─ updateUserAuthorization                    Firestore Transaction + effectivePermissions + Auth sync
```

El servicio `UserAuthorizationAdminService` observa en tiempo real los documentos de la colección `users` de Firestore mediante `collectionData()`. Paginación, filtrado y búsqueda operan sobre la lista devuelta por Firestore. Los fixtures hardcodeados (Ana/Bruno/Carla/Diego) fueron eliminados del runtime del servicio y permanecen únicamente como dobles de prueba (`spec`). La actualización de permisos y la creación de usuarios invocan callable Functions (`httpsCallable`) ejecutadas con Admin SDK en servidor.


## Evidencia de acceso

- `app.routes.ts`: `/dashboard/usuarios-permisos` usa `permissionGuard` y `data.permission = 'users.view'`.
- La misma ruta registra `userAuthorizationPendingChangesGuard` en `canDeactivate`.
- `dashboard-layout.component.ts`: la entrada “Usuarios y permisos” requiere `users.view` y `visibleNavItems` filtra con `auth.can()`.
- `UsuariosPermisosComponent.canManage`: evalúa `auth.can('permissions.managePermissions')` para mutaciones.

## Flujo actual exacto

1. `ngOnInit()` llama `retryLoadUsers()`.
2. `loadUsers(options)` activa loading y limpia error al suscribirse; tras `delayMs` devuelve copias, vacío o error controlado y `finalize` cierra loading.
3. `users()` aplica búsqueda/filtros sobre `admin.users()` y reinicia la página al cambiar un filtro; la tabla muestra `paginatedUsers().items`.
4. El botón lápiz ejecuta `(click)="select(user)"`.
5. Sin usuario u original, `dirty()` retorna `false`; no construye un comando ficticio.
6. El primer click llama `applySelection()`, clona overrides, carga roleId/active, establece original normalizado y abre `UserAuthorizationEditDialogComponent`.
7. Cambiar de usuario sin cambios aplica la nueva selección inmediatamente.
8. Cambiar con dirty abre `ConfirmDialogComponent`: Cancelar conserva estado; Descartar y continuar carga el nuevo usuario y deja dirty en false.
9. Editar roleId, active u overrides activa dirty y muestra Descartar/Guardar en las acciones fijas del modal.
10. Guardar confirma, llama una vez al adaptador local, resincroniza selección/original/formulario, muestra snackbar y el diálogo de edición se cierra tras éxito. Ante error permanece abierto.
11. El listado ocupa siempre todo el ancho; la selección solo identifica la fila. No existe editor inline, debajo ni en master/detail.
12. Cerrar el modal limpio es inmediato. Con dirty se ofrece Continuar editando o Descartar y cerrar; backdrop/Escape no descartan silenciosamente.
13. Al abandonar la ruta, dirty falso sale directamente. Dirty verdadero abre una única confirmación: Permanecer conserva selección/formulario y Descartar y salir permite navegar sin guardar.

## Corrección exacta del lápiz

| Pregunta | Respuesta comprobada |
| --- | --- |
| ¿Existe `(click)`? | Sí: `(click)="select(user)"` en la celda `select` de `usuarios-permisos.html`. |
| ¿Qué método llama? | `UsuariosPermisosComponent.select(user)`. |
| ¿Cambia la selección? | Sí. Sin cambios llama `applySelection(user)` inmediatamente. |
| ¿Se carga el formulario? | Sí; `applySelection()` carga roleId/active y establece original. |
| ¿Qué controla el editor? | `select()` aplica la selección y `openEditor()` abre un único `UserAuthorizationEditDialogComponent`. |
| ¿Existe el editor? | Sí, contiene rol, active, overrides, efectivo y acciones dirty dentro de `MatDialog`. |
| ¿Está oculto por CSS? | No. Se renderiza en el overlay Material, fuera del flujo vertical del listado. |
| ¿Falta el evento? | No. |
| ¿Hay error causado por el click? | No; el flujo está cubierto por prueba DOM y la suite pasa. |
| ¿El layout impide verlo? | No. El listado permanece full-width y el diálogo queda centrado/limitado al viewport. |

La causa histórica era la comparación comando vacío vs. `null`. Se eliminó haciendo que dirty sea falso sin selección/original y comparando solo comandos normalizados. Los overrides se ordenan por `PERMISSION_KEYS` y se omiten valores `undefined`.

## Fuente real del listado

La fuente canónica es la signal privada `UserAuthorizationAdminService.localRecords`; la signal pública `users` expone copias de:

- `local-owner`: Ana Owner;
- `local-admin`: Bruno Admin;
- `local-seller`: Carla Seller;
- `local-inactive`: Diego Inactivo.

Ana, Bruno y Carla aparecen porque son literales del servicio. Diego también forma parte del array y el filtro inicial es `all`; el código auditado no lo excluye inicialmente. Por tanto, una observación visual de solo tres filas no coincide con el estado inicial de esta fuente y requiere reproducir esa sesión concreta; no se asigna una causa sin evidencia runtime.

`loadUsers()` no carga datos externos. Su contrato final de FASE C es:

```ts
loadUsers(
  options?: UserAuthorizationLoadOptions
): Observable<UserAuthorizationAdminRecord[]>

interface UserAuthorizationLoadOptions {
  delayMs?: number;
  simulateFailure?: boolean;
  simulateEmpty?: boolean;
}
```

- `delayMs` controla el retardo local y se normaliza a cero o mayor.
- `simulateEmpty` devuelve `[]` y actualiza la vista pública sin borrar los fixtures canónicos.
- `simulateFailure` emite `No se pudieron cargar los usuarios locales.`, conserva la memoria y alimenta error/retry.
- Cada éxito devuelve copias independientes, incluidos overrides y permisos efectivos.
- Cada suscripción inicia loading, limpia error y usa `finalize` para dejar loading en false.
- El flag público de fallo de guardado se mantiene separado y tampoco usa red.

### Piezas faltantes para usuarios reales

1. Contrato de listado administrativo paginado.
2. Lectura real y autorizada de `users` desde Firestore; callable solo si hace falta enriquecer con Firebase Auth.
3. DTO que no exponga secretos ni datos innecesarios.
4. Adaptador Angular con loading/error/retry conectados a la fuente real, conservando el contrato de estados ya probado.
5. Paginación/orden y tratamiento de perfiles incompletos.
6. Tests del repositorio y, cuando aplique, Function/Rules en emulador.

`UserRepository.getProfile(uid)` solo observa `users/{uid}` para la sesión actual. La clase también hereda `getAll()` de `FirestoreRepository`, pero ninguna pieza administrativa lo consume hoy. Ese helper filtra por la convención `activo`, mientras el perfil usa `active`; `getAll(true)` evita el filtro, pero una implementación real debería usar un repositorio/consulta cuyo contrato represente correctamente perfiles activos e inactivos. Ninguna consulta Firestore enumera usuarios de Firebase Auth que no tengan perfil.

## Formularios y permisos efectivos

El formulario reactivo contiene `roleId` y `active`. Los overrides viven dentro del objeto `selected`, no como controles del `FormGroup`. `dirty()` compara el comando actual y el original solo cuando ambos contextos existen. roleId/active se normalizan y los overrides se reconstruyen en orden canónico, sin `undefined`.

Los controles se crean inicialmente deshabilitados y `syncFormAccess()` usa `enable()`/`disable()` según selección, `permissions.managePermissions` y `protectedOwner`. Se retiró `[disabled]` de los controles reactivos del template; con ello desapareció el warning de Angular Material sin cambiar la política local.

`effective(key)` devuelve:

1. `true` si `protectedOwner` es verdadero;
2. si existe, el override local;
3. en otro caso, `defaultPermissions(roleId)[key]`.

No usa el `RoleRepository`, el documento real `roles/{roleId}` ni `user.effectivePermissions`. Por eso es una vista local aproximada: coincide con el seed actual mientras los roles reflejen exactamente los defaults, pero divergiría si un rol cambia en Firestore.

## Estado real de Guardar

`save()` es alcanzable y exige:

- `dirty()` verdadero;
- formulario válido;
- `saving()` falso;
- ninguna confirmación de save ya abierta;
- `permissions.managePermissions` concedido;
- selección y original presentes;
- confirmación positiva del `MatDialog`.

Payload actual exacto:

```ts
interface UpdateUserAuthorizationCommand {
  uid: string;
  roleId: string;
  active: boolean;
  permissionOverrides: Partial<Record<PermissionKey, boolean>>;
}
```

Ejemplo construido por `command()`:

```ts
{
  uid: user.uid,
  roleId: normalizedRoleId,
  active: normalizedActive,
  permissionOverrides: normalizedOverridesInCatalogOrder
}
```

`updateUserAuthorization()` valida claves conocidas, existencia en el array y restricciones parciales del owner. Después actualiza de forma inmutable solo el target dentro de `localRecords` y publica otra copia en `users`. Las validaciones y el fallo simulado ocurren antes de ambas escrituras, por lo que no existen cambios parciales.

No existe llamada Firestore, HTTP ni callable. El éxito actualiza la signal, selección, original y formulario, deja dirty en false y muestra `MatSnackBar`. El error conserva el formulario editado y muestra un mensaje genérico. El cambio se pierde al recargar. Un flag de confirmación evita dos diálogos/llamadas por doble click.

## Cambios pendientes y confirmaciones

- Guardar tiene un diálogo de confirmación embebido en el mismo archivo TS.
- El diálogo informa rol/estado si cambiaron y un resumen genérico de overrides; no enumera diferencias por permiso.
- Descartar restaura roleId, active y overrides sin llamar al servicio y mantiene el usuario.
- El editor principal es `UserAuthorizationEditDialogComponent`, con cierre implícito deshabilitado para no perder cambios por backdrop/Escape.
- Cerrar limpio termina inmediatamente. Cerrar dirty reutiliza `ConfirmDialogComponent` con Continuar editando y Descartar y cerrar; confirmar ejecuta `discard()` antes de cerrar.
- Un save exitoso cierra el editor; un error mantiene formulario y modal abiertos.
- Cambiar de usuario con dirty reutiliza `ConfirmDialogComponent` con Cancelar y Descartar y continuar.
- Cancelar conserva selección y formulario; confirmar reemplaza usuario/original/formulario y deja dirty en false.
- Abandonar la ruta mediante Angular Router está protegido por `userAuthorizationPendingChangesGuard`.
- Sin dirty el guard retorna `true` sin abrir diálogo.
- Con dirty, `confirmNavigationAway()` reutiliza `ConfirmDialogComponent`: Permanecer retorna `false`; Descartar y salir retorna `true` sin guardar ni llamar al servicio.
- Una navegación repetida mientras el diálogo está abierto comparte el mismo observable mediante `shareReplay`, evitando duplicados. Material restaura el foco al cerrar.
- No se intercepta el cierre de pestaña con `beforeunload`; esa capacidad no tiene patrón aprobado en el proyecto y quedó expresamente fuera del alcance.

## Protección del owner

La UI deshabilita rol, estado y overrides para `protectedOwner`. `setOverride()` bloquea `deny`, y el servicio local rechaza cambio de rol/desactivación y denies de tres permisos críticos (`dashboard.view`, `users.view`, `permissions.managePermissions`).

Esto es solo protección local. Faltan:

- último owner activo/protegido;
- concurrencia;
- anti-autoescalación;
- actor/target y auditoría;
- validación Admin SDK;
- Rules que rechacen escritura cliente sensible.

## Integración visual implementada

### Corrección de la causa del ancho reducido

La causa histórica era una grilla con dos pistas permanentes, aun cuando el editor no existía en el DOM. FASE B la corrigió primero con master/detail condicional. El refinamiento actual elimina por completo la segunda pista y el card de edición:

```css
.users-layout {
  grid-template-columns: minmax(0, 1fr);
}
```

El listado ocupa siempre todo el ancho. `selected()` identifica la fila y alimenta el formulario, mientras `openEditor()` abre el editor en el overlay Material. No aparece contenido adicional debajo de la tabla.

### Patrón reutilizado de módulos consolidados

| Elemento | Implementación final de Usuarios y permisos |
| --- | --- |
| Header | `PageHeaderComponent` dentro del `.content` global, igual que Productos y módulos consolidados. |
| Filtros | Grid Material alineado con la tabla: búsqueda, rol, estado y acción limpiar. |
| Tabla | `mat-table` a ancho disponible, estados visuales para rol/active y fila seleccionada. |
| Scroll | Wrapper `.table-scroll` con overflow horizontal controlado y foco visible. |
| Paginator | `MatPaginator` con `paginateItems()`, tamaño inicial 10 y opciones compartidas 10/25/50. |
| Editor | `MatDialog` como Productos, Clientes y Proveedores: `min(960px, 96vw)`, máximo `92vh`, título/contenido/acciones Material. |
| Tokens | El diálogo usa `--mat-sys-primary`, `--mat-sys-error`, `--mat-sys-on-surface-variant` y `--mat-sys-outline-variant`; la página conserva la identidad global Hypezone. |
| Estados | Loading, error/retry y empty usan los patrones de estado del dashboard y atributos de anuncio. |
| Accesibilidad | Lápiz con label específico/pressed, fila `aria-selected`, título accesible, autofocus, foco restaurado y cierre dirty confirmado. |

### Decisión de paginación

Se incorporó paginator porque Productos, Ventas, Clientes, Proveedores y Lotes ya usan el mismo patrón y util compartido. En esta fase es paginación cliente: `users()` filtra primero y `paginatedUsers()` corta el resultado después. Cambiar búsqueda/rol/estado o limpiar filtros vuelve a página cero. El contrato visual puede mantenerse cuando la fuente sea real, pero FASE D deberá decidir si la paginación remota usa cursor y adaptar los metadatos sin presentar el slice local como backend.

## Responsive real verificado

La validación final fijó cada viewport mediante Chrome DevTools Protocol, incluida una anchura real de 320 px:

- **1440 px:** listado full-width; diálogo de 960 px, contenido desplazable y acciones dirty visibles.
- **1024 px:** listado full-width; diálogo conserva 960 px con márgenes seguros de 32 px.
- **768 px:** filtros en dos columnas; diálogo al 96vw, tabla y overlay contenidos.
- **600 px:** filtros pasan a una columna; autorización y permisos se apilan dentro del modal; acciones dirty en una columna.
- **480 px:** body sin overflow; contenido del modal se reduce para reservar espacio a sus tres acciones.
- **320 px:** body sin overflow; diálogo de 293 px, contenido con scroll interno y Cerrar/Descartar/Guardar completamente visibles.

Breakpoints implementados:

- `900px`: coincide con el breakpoint global de `.content`; filtros pasan a dos columnas y se reduce padding.
- `600px`: filtros pasan a una columna; controles, filas de permisos y acciones del diálogo ocupan todo el ancho.

La tabla no se transforma en cards porque los módulos existentes conservan tablas Material. Su ancho mínimo queda contenido por `.table-scroll`; el paginator también tiene overflow propio. El host del diálogo usa grid `auto minmax(0, 1fr) auto`, por lo que solo el contenido central desplaza y título/acciones permanecen accesibles.

Clasificación: **COMPLETO para la UI local/mock**. No se introdujo un framework E2E: se usó un host DEV temporal con el componente real y CDP, y se eliminaron arnés, perfil y capturas al finalizar. Esto no cambia que la fuente y la persistencia sigan siendo locales.

## Loading, error y retry

- Loading es visible y verificable, aunque artificial respecto a datos externos.
- `delayMs` permite observar el estado pendiente sin temporizadores rígidos del componente.
- `simulateEmpty` verifica el mensaje vacío y ausencia de paginator.
- `simulateFailure` de carga alimenta el alert y el botón Reintentar.
- Reintentar limpia el error en el mismo inicio de suscripción; un éxito posterior vuelve a mostrar tabla.
- `finalize` deja loading en false tanto en éxito como error.

Los tres estados se clasifican **LOCAL/MOCK**: están conectados y probados, pero no representan latencia ni fallos de una fuente remota.

## Problemas funcionales priorizados

1. El listado no proviene de usuarios reales.
2. Guardar solo muta memoria local.
3. La política futura de claves específicas para rol/active/overrides sigue pendiente; localmente se conserva `permissions.managePermissions`.
4. La vista efectiva no usa documentos reales de rol/materialización.
5. La paginación actual corta un array local; FASE D debe definir orden/cursor para datos reales.
6. La protección de salida solo cubre Angular Router; cierre/recarga de pestaña no se interceptan.

## Diferencias entre documentación previa y código

| Afirmación documental previa | Código/estado auditado |
| --- | --- |
| “No existe UI de Usuarios y permisos” | Ruta, componente, HTML, CSS, servicio local, dialog y snackbar sí existen. |
| “No existe seed/migración” | Existe script DEV que crea/reemplaza tres roles y parchea/verifica owner; aplicación confirmada en contexto. |
| “Rules no permiten resolver roles” | Rules locales ya permiten leer `roles/{roleId}` a perfiles activos. |
| “Phase 4 UI es futura” | El flujo local de selección/edición y su layout responsive ya funcionan; sigue sin backend real. |
| “No existen pruebas v2” | Existen `100/100` pruebas: 39 del componente, 5 del editor modal, 14 del adaptador local, 3 del CanDeactivate y cobertura de guards/sidebar además de suites previas. Functions y Rules pertenecen a fases posteriores. |
| “DEV aún debe crearse/configurarse” en docs generales | `.firebaserc`, environment DEV y contexto confirmado muestran `hypezone-dev`; esos docs generales aún requieren reconciliación. |

## Verificación final del frontend

- Componente: 39 casos para listado, filtros, edición, overrides, permisos efectivos, owner, paginación, diálogos, errores y navegación.
- Editor modal: 5 casos para estructura Material, acciones dirty, teclado, cierre limpio, confirmación de descarte y cierre tras save.
- Adaptador: 14 casos para copias, delay, vacío, fallo/retry, loading/error, actualización, inmutabilidad, invariantes y atomicidad local.
- CanDeactivate: 3 casos directos; además se verifica su registro junto a `permissionGuard` y `users.view`.
- Guards/sidebar: permiso simple, any/all y aparición/retiro reactivo de la entrada administrativa.
- Accesibilidad: botones semánticos activables por teclado, `aria-label`, `aria-pressed`, `aria-selected`, mensajes con live regions, foco visible y restauración de foco en diálogos.
- Build DEV: PASS sin warnings.
- Build PROD: PASS; permanecen warnings de bundle inicial (`772.45 kB`) y CSS previo de Ventas (`4.79 kB`). Usuarios y permisos ya no excede el budget CSS.
- Tests: `100/100 SUCCESS` en Chrome Headless 150; sin warning de `[disabled]` en Reactive Forms.

## Integración pendiente

La integración real requiere contratos, callable de listado/update, Admin SDK, cálculo servidor de permisos efectivos, auditoría, invariantes de owner, Rules v2, emuladores y pruebas. No debe reutilizarse `FirestoreRepository.update()` para escribir autorización desde el navegador.

## Fases siguientes

- **FASE A:** **COMPLETA en local/mock**: selección, dirty, confirmaciones, save/discard, owner y 15 tests.
- **FASE B:** **COMPLETA sobre UI local/mock**: ancho completo, tabla, paginator y responsive. Su master/detail original fue reemplazado posteriormente por el diálogo Material.
- **FASE C:** **COMPLETA sobre frontend local/mock**: contrato de simulación, 100 tests, CanDeactivate, editor modal, teclado/ARIA/foco, responsive exacto y builds DEV/PROD.
- **FASE D:** contratos y listado Firestore real de solo lectura; retirar fixtures runtime.
- **FASE E:** Function de update, conexión de Guardar, materialización e invariantes Admin SDK; listado callable solo si Auth lo exige.
- **FASE F:** Functions emulator, Rules v2 y matriz de pruebas.
- **FASE G:** deploy exclusivamente DEV con autorización explícita, smoke tests y rollback.

El detalle ejecutable, dependencias, criterios y riesgos está en [ROADMAP.md](ROADMAP.md).
