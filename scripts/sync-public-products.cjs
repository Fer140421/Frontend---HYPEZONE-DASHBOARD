'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const requestedProjectId = process.argv.find((value, index, args) => args[index - 1] === '--project');
const apply = process.argv.includes('--apply');

function fail(message) {
  throw new Error(`[sync-public-products] ${message}`);
}

function firebaseToolsModule(relativePath) {
  const globalModules = path.join(path.dirname(process.execPath), 'node_modules');
  return require(path.join(globalModules, 'firebase-tools', relativePath));
}

async function accessToken() {
  const auth = firebaseToolsModule('lib/auth.js');
  const account = auth.getProjectDefaultAccount(root) ?? auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) fail('No hay una sesión autenticada en Firebase CLI.');
  const tokens = await auth.getAccessToken(account.tokens.refresh_token, []);
  return tokens.access_token;
}

function getActiveProjectId() {
  if (requestedProjectId) return requestedProjectId;
  return execFileSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['use'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === 'object') {
    if ('stringValue' in value || 'booleanValue' in value || 'integerValue' in value || 'doubleValue' in value || 'arrayValue' in value || 'mapValue' in value || 'nullValue' in value) {
      return value;
    }
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encodeValue(v)])) } };
  }
  return { stringValue: String(value) };
}

function sanitizeFields(fields) {
  const allowed = [
    'nombre', 'marca', 'categoria', 'descripcion', 'talla', 'color',
    'genero', 'precioVenta', 'precioOferta', 'estado', 'imagenes',
    'codigo', 'activo', 'createdAt', 'updatedAt'
  ];

  const sanitized = {};
  for (const key of allowed) {
    if (key in fields) {
      sanitized[key] = fields[key];
    }
  }

  if (!('activo' in sanitized)) {
    sanitized.activo = { booleanValue: true };
  }

  if (!('estado' in sanitized)) {
    sanitized.estado = { stringValue: 'disponible' };
  }

  if (!('imagenes' in sanitized)) {
    if ('imagen' in fields) {
      const rawImagen = fields.imagen;
      if (rawImagen.stringValue) {
        sanitized.imagenes = { arrayValue: { values: [{ stringValue: rawImagen.stringValue }] } };
      } else if (rawImagen.arrayValue) {
        sanitized.imagenes = rawImagen;
      } else {
        sanitized.imagenes = { arrayValue: { values: [] } };
      }
    } else {
      sanitized.imagenes = { arrayValue: { values: [] } };
    }
  }

  return sanitized;
}

async function firestoreRequest(projectId, token, method, suffix, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${suffix}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) fail(`${method} ${suffix} devolvió ${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function main() {
  const projectId = getActiveProjectId();
  console.log(`📌 Sincronizando productos a productosPublicos en el proyecto: ${projectId}`);

  const token = await accessToken();
  const productsResponse = await firestoreRequest(projectId, token, 'GET', 'productos?pageSize=1000');
  const documents = productsResponse.documents ?? [];

  console.log(`📦 Encontrados ${documents.length} documentos en la colección 'productos'.`);

  if (!apply) {
    console.log('🔍 MODO VISTA PREVIA (simulación). No se realizaron escrituras.');
    console.log('👉 Ejecuta con --apply para realizar la sincronización real en Firestore.');
    return;
  }

  let count = 0;
  for (const doc of documents) {
    const docId = doc.name.split('/').pop();
    const rawFields = doc.fields ?? {};
    const publicFields = sanitizeFields(rawFields);

    await firestoreRequest(projectId, token, 'PATCH', `productosPublicos/${docId}`, {
      fields: publicFields,
    });
    count++;
  }

  console.log(`✅ ¡Sincronización completada exitosamente! ${count} productos reflejados en 'productosPublicos'.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
