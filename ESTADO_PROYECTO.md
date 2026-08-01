# Estado de desarrollo — Dashboard Hypezone

Fecha de corte: **2026-07-24**

Este documento resume el estado técnico real y la arquitectura del dashboard Hypezone para la continuidad del desarrollo.

---

## Resumen ejecutivo

El proyecto es una aplicación **Angular 20/21 standalone** con **Angular Material** y **Firebase** (Authentication, Firestore, Cloud Functions v2, Hosting) diseñada para la gestión integral de un e-commerce de ropa streetwear.

El proyecto compila exitosamente en desarrollo (`npm run build:dev`) y producción (`npm run build:prod`), y cuenta con una suite de **100 pruebas unitarias/integración automatizadas** en Chrome Headless pasando al 100%.

Toda la arquitectura de **autorización dinámica (Authorization V2)** se desarrolló sobre el entorno **DEV** (`hypezone-dev`).

---

## Stack técnico

- **Core:** Angular 20/21 Standalone Components, RxJS, Signals, Reactive Forms, Lazy Loading.
- **UI:** Angular Material, Vanilla SCSS/CSS modular con tokens de diseño dark/streetwear.
- **Backend / BaaS:** Firebase Authentication, Cloud Firestore, Cloud Functions v2 (TypeScript / Admin SDK).
- **Servicios externos:** Cloudinary REST API via `HttpClient` (upload de imágenes sin SDK pesado).
- **Herramientas de construcción:** Angular CLI 20.3.x, TypeScript 5.9.x, Jasmine/Karma.

---

## Módulos y funcionalidades implementadas

### 1. Sistema de Autorización Dinámica (Authorization V2)

- **Catálogo tipado (`permission-catalog.ts`):** 17 permisos definidos de manera declarativa (`dashboard.view`, `users.view`, `products.view`, `products.create`, `sales.create`, `permissions.managePermissions`, etc.).
- **Roles en Firestore (`roles/{roleId}`):** Roles como documentos (`owner`, `admin`, `seller`).
- **Permisos efectivos (`effectivePermissions`):** Resolución combinada de permisos por defecto del rol + `permissionOverrides` individuales.
- **`AuthService`:** Evalúa reactivamente permisos con `can()`, `canAny()`, `canAll()` y `hasModuleAccess()`. Expone los estados de sesión (`authenticated`, `unauthenticated`, `missing-profile`, `inactive`).
- **Guards:**
  - `authGuard`: Protege la ruta raíz `/dashboard`.
  - `permissionGuard`: Protege declarativamente cada ruta hija según la clave de permiso requerida.
  - `userAuthorizationPendingChangesGuard`: Guard `CanDeactivate` para impedir salida involuntaria con cambios no guardados.
- **Sidebar dinámico:** Filtra las opciones visibles en la barra lateral según los permisos del usuario autenticado.

### 2. Administración de Usuarios y Permisos (`/dashboard/usuarios-permisos`)

- **Listado en tiempo real:** Conectado directamente a Firestore (`collectionData('users')`) vía `UserAuthorizationAdminService`.
- **Filtros y paginación:** Búsqueda por texto (nombre/email), filtro por rol y estado (activo/inactivo), y paginación con `MatPaginator`.
- **Edición modal (`UserAuthorizationEditDialogComponent`):** Diálogo `MatDialog` responsive para modificar `roleId`, estado `active` y la matriz de `permissionOverrides` (Heredar, Permitir, Denegar).
- **Creación modal (`UserCreateDialogComponent`):** Diálogo `MatDialog` para registrar nuevos usuarios con rol, estado y overrides.
- **Cloud Functions (`functions/src/index.ts`):**
  - `createUser`: Crea la cuenta en Firebase Auth con contraseña temporal, genera el documento en Firestore `/users/{uid}`, recalcula `effectivePermissions` en servidor y retorna la credencial.
  - `updateUserAuthorization`: Ejecuta transacciones Firestore para mutar `roleId`, `active` y overrides, sincroniza Firebase Auth y protege contra auto-degradación de privilegios y degradación del owner.
- **Estado de despliegue de Functions:** Las funciones están implementadas en código TypeScript y conectadas en el frontend via `httpsCallable`, pendientes de validación en emuladores y despliegue a `hypezone-dev`.

### 3. Módulos Operativos de Negocio

- **Módulo de Lotes (`/dashboard/lotes`):** CRUD de lotes de prendas, métricas de inversión/ingresos (`LoteAnalyticsService`), asignación de productos y **soporte multi-foto habilitado al crear productos dentro de un lote** (subida simultánea de hasta 5 imágenes).
- **Componente de Carga de Imágenes Rediseñado (`ImageUploaderComponent`):**
  - **Soporte Multi-Imagen Habilitado:** Carga múltiple en Productos y Lotes con límites configurables (por defecto 5 fotos) y compresión previa en navegador mantenida.
  - **Indicadores de Estado UI en Tiempo Real:** Estado activo con icono giratorio (`sync` spinner), texto descriptivo ("Comprimiendo y subiendo fotos...") e indicador de progreso/capacidad (ej. `3 / 5 fotos`).
  - **Tarjetas de Prevista con Eliminación:** Vista previa en cuadrícula con badges de posición (`Principal`, `#2`, `#3`) y **botón directo para eliminar cualquier foto cargada por error (`delete`)**.
- **Productos (`/dashboard/productos`):** CRUD completo de inventario, soporte multi-imagen Cloudinary con compresión automática pre-upload en cliente, cambio rápido de precio, borrado lógico, restauración y **rediseño completo del modal de vista de detalle (Galería interactiva con miniaturas, object-fit sin deformación, tarjetas de precios y especificaciones)**.
- **Estandarización de Listados y Filtros (`.list-card`):** Formato único y unificado para las pantallas de listado (`Productos`, `Lotes`, `Ventas`, `Clientes`, `Proveedores`, `Marcas`, `Tallas`, `Categorías` y `Usuarios/Permisos`), garantizando paddings consistentes (20px), espaciado controlado entre filtros y tablas (16px) y estilos de tabla homogéneos en todo el dashboard.
- **Flujo Modal Unificado en Catálogos (`Marcas`, `Tallas` y `Categorías`):** Eliminación de formularios inline en listas; la creación y edición de registros se realiza mediante diálogos modales interactivos (`MatDialog`) con botón de acción en el encabezado (`Nueva marca`, `Nueva talla`, `Nueva categoría`), manteniendo coherencia con el flujo global del sistema.
- **Optimización de Imágenes Pre-Upload (`image-compressor.util.ts`):** Redimensión y compresión automática en el navegador vía HTML5 Canvas antes del envío HTTP a Cloudinary. Soporta imágenes de alta resolución (iPhone/Android, HEIC/JPEG/PNG/WEBP), limita las dimensiones a un máximo de `1920px` manteniendo relación de aspecto y comprime a calidad `85%`, reduciendo el peso de los archivos entre **80% y 95%** sin pérdida de calidad visual perceptible.
- **Ventas (`/dashboard/ventas`):** Registro de ventas transaccionales en Firestore (`runTransaction`), actualización automática de estado del producto a vendido, historial y snapshots.
- **Clientes / Proveedores / Catálogos (`/dashboard/clientes`, `/dashboard/proveedores`, `/dashboard/catalogos`, `/dashboard/marcas`, `/dashboard/tallas`):** Pantallas administrativas protegidas por permisos declarativos.
- **Limpieza de productos (`/dashboard/limpieza-productos`):** Herramienta manual auditada para elevar el esquema de productos a `schemaVersion: 3`.

---

## Estado por Fases de Autorización

| Fase | Descripción | Estado |
| --- | --- | --- |
| **Fase A** | Corregir UI y flujo local | **COMPLETA** |
| **Fase B** | Responsive (1440-320px) e integración visual Angular Material | **COMPLETA** |
| **Fase C** | Pruebas frontend (100/100) y guard de salida `CanDeactivate` | **COMPLETA** |
| **Fase D** | Integración real de lectura Firestore (servicio conectado, mocks retirados de runtime) | **PARCIAL** (Lectura Firestore lista; pendiente paginación por cursor en backend si crece la colección) |
| **Fase E** | Cloud Functions (`createUser`, `updateUserAuthorization`) | **PARCIAL** (Código e integración Angular completados; pendiente validación Emulator y Deploy) |
| **Fase F** | Security Rules v2 y validación con Emulator Suite | **PENDIENTE** (`firestore.rules` listo en repo; pendiente ejecución de emuladores) |
| **Fase G** | Deploy DEV (`hypezone-dev`), smoke tests y deploy PROD (`hypezone-3ed2a`) | **PENDIENTE** |

---

## Verificación de comandos

- `npm run build:dev`: **PASS** (Compilación DEV limpia).
- `npm run build:prod`: **PASS** (Compilación PROD limpia con budgets documentados).
- `npm --prefix functions run build`: **PASS** (Compilación TypeScript de Functions limpia).
- `npm test`: **PASS** (**100/100 tests exitosos** en Chrome Headless).

---

## Siguiente paso recomendado

Consultar `docs/authorization-v2/STATUS.md` y ejecutar las pruebas de emulador (Fase F) antes de desplegar Cloud Functions y Security Rules a `hypezone-dev` (Fase G).
