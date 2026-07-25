# Configuración de Entornos Firebase

El proyecto HypeZone Dashboard cuenta con una separación estricta entre los entornos de Desarrollo (**DEV**) y Producción (**PROD**).

---

## Proyectos Firebase

| Entorno | Alias CLI | Firebase Project ID | Propósito |
| --- | --- | --- | --- |
| **DEV** | `dev` | `hypezone-dev` | Entorno de desarrollo, pruebas e implementación de nuevas características. |
| **PROD** | `prod` | `hypezone-3ed2a` | Entorno de producción en vivo. |

Toda la implementación actual de autorización dinámica (Authorization V2), migración de esquema y Cloud Functions se realizó exclusivamente para el entorno **DEV**.

---

## Archivos de Entorno en Angular

- `src/environments/environment.ts`: Configuración base local.
- `src/environments/environment.development.ts`: Configuración de desarrollo (`hypezone-dev`), utilizada por `ng serve` y `npm run start:dev`.
- `src/environments/environment.production.ts`: Configuración de producción (`hypezone-3ed2a`), utilizada por `npm run build:prod`.

---

## Configuración de Aliases en Firebase CLI (`.firebaserc`)

```json
{
  "projects": {
    "prod": "hypezone-3ed2a",
    "dev": "hypezone-dev"
  }
}
```

---

## Comandos para Gestión de Entornos

- **Iniciar desarrollo DEV:** `npm run start:dev`
- **Compilar para DEV:** `npm run build:dev`
- **Compilar para PROD:** `npm run build:prod`
- **Seleccionar alias DEV en CLI:** `npm run firebase:use:dev`
- **Seleccionar alias PROD en CLI:** `npm run firebase:use:prod`
- **Sembrar roles y owner inicial en DEV:** `npm run seed:firebase:dev`
- **Compilar Cloud Functions:** `npm run functions:build`
- **Iniciar Emuladores Firebase:** `npm run emulators`

---

## Reglas y Políticas de Despliegue

1. **Nunca desplegar a Producción (`hypezone-3ed2a`) sin autorización explícita.**
2. **Validación previa:** Todo cambio en Cloud Functions o Firestore Rules debe ser probado primeramente con Firebase Emulator Suite (`npm run emulators`) y posteriormente en `hypezone-dev`.
3. **Indicador de Entorno:** El dashboard en DEV muestra la etiqueta visual `ENTORNO DE DEV` en la barra superior del layout.
