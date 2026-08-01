# HypeZone Dashboard

Dashboard administrativo para tienda e-commerce de ropa streetwear. Desarrollado con **Angular 20/21**, **Angular Material** y **Firebase** (Authentication, Firestore, Cloud Functions, Hosting).

---

## Características principales

- **Autorización Dinámica por Permisos (Authorization V2):** Catálogo granular de 17 permisos, roles como documentos en Firestore, mapa `effectivePermissions` materializado en servidor y evaluación reactativa en tiempo real.
- **Administración de Usuarios:** Listado en tiempo real con Firestore, edición de roles y overrides en modal `MatDialog`, creación de usuarios con generación de contraseñas temporales vía Cloud Functions Admin SDK, y protección de navegación `CanDeactivate`.
- **Gestión de Inventario, Lotes y Subida de Imágenes Optimizada:** Control de productos y lotes con analítica de ganancia, y componente de subida de imágenes con **compresión y redimensión automática en cliente (HTML5 Canvas)** previa al envío a Cloudinary, optimizando fotos pesadas de iPhone/Android (reducción de hasta 95% en peso sin pérdida visual).
- **Registro Transaccional de Ventas:** Confirmaciones atómicas con `runTransaction` en Firestore, actualización de stock e historial.
- **Diseño Moderno y Responsivo:** Interfaz oscura adaptada a múltiples breakpoints (1440px a 320px) con Angular Material.

---

## Requisitos del sistema

- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Angular CLI:** `20.3.31`
- **Firebase CLI:** Para administración de proyectos y despliegues (`npm install -g firebase-tools`).

---

## Instalación y configuración local

1. **Clonar el repositorio e instalar dependencias:**

   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

2. **Configurar variables de entorno:**

   Completar las credenciales de Firebase en `src/environments/environment.development.ts` y `src/environments/environment.production.ts`.

3. **Iniciar el servidor de desarrollo:**

   ```bash
   npm run start:dev
   ```

   La aplicación estará disponible en `http://localhost:4200/`.

---

## Scripts disponibles

| Comando | Descripción |
| --- | --- |
| `npm start` | Inicia el servidor de desarrollo Angular. |
| `npm run start:dev` | Inicia el servidor usando la configuración de desarrollo (`hypezone-dev`). |
| `npm run start:prod` | Inicia el servidor de desarrollo apuntando al entorno de producción (`hypezone-3ed2a`). |
| `npm run build:dev` | Compila la aplicación Angular en modo desarrollo. |
| `npm run build:prod` | Compila la aplicación Angular para producción (`hypezone-3ed2a`). |
| `npm test` | Ejecuta la suite de 100 pruebas unitarias con Karma/Jasmine en Chrome Headless. |
| `npm run functions:build` | Compila el proyecto de Cloud Functions TypeScript en `functions/`. |
| `npm run seed:firebase:dev` | Ejecuta el script de inicialización de roles y owner en `hypezone-dev`. |
| `npm run emulators` | Inicia Firebase Emulator Suite (Auth, Firestore, Functions). |
| `npm run firebase:use:dev` | Selecciona el proyecto Firebase `hypezone-dev`. |
| `npm run firebase:use:prod` | Selecciona el proyecto Firebase `hypezone-3ed2a`. |

---

## Estructura del proyecto

```text
dashboard_hypezone/
├── docs/                      # Documentación del sistema y arquitectura
│   └── authorization-v2/     # Especificaciones, ROADMAP, STATUS y AUDITORÍA v2
├── functions/                 # Cloud Functions (TypeScript + Firebase Admin SDK)
│   └── src/
│       ├── index.ts           # Callable Functions (createUser, updateUserAuthorization)
│       └── permissions.ts     # Definición de catálogo y permisos efectivos en servidor
├── src/
│   ├── app/
│   │   ├── core/              # Servicios de Auth, repositorios Firestore, guards, catálogo
│   │   ├── features/          # Pantallas (resumen, productos, lotes, ventas, usuarios-permisos)
│   │   └── shared/            # Componentes reutilizables (headers, diálogos, paginador, chips)
│   ├── environments/          # Configuraciones de entornos DEV y PROD
│   └── styles.css             # Estilos globales y tokens Angular Material
├── firestore.rules            # Security Rules v2 de Firestore
├── firebase.json              # Configuración de Firebase Hosting, Functions y Firestore
└── ESTADO_PROYECTO.md         # Informe detallado del estado del desarrollo
```

---

## Documentación detallada

Consulte la documentación del proyecto para obtener información técnica y de arquitectura:
- [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) — Diccionario de datos, diagrama Entidad-Relación y Security Rules de Firestore.
- [STATUS.md](docs/authorization-v2/STATUS.md) — Estado de auditoría y avance por funcionalidad.
- [ROADMAP.md](docs/authorization-v2/ROADMAP.md) — Plan de fases de autorización A a G.
- [TODO.md](docs/authorization-v2/TODO.md) — Tareas completadas y pendientes.
- [DECISIONS.md](docs/authorization-v2/DECISIONS.md) — Decisiones de arquitectura y diseño.
