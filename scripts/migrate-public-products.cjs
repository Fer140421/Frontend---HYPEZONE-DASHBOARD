'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceProjectId = process.argv.find((value, index, args) => args[index - 1] === '--source');
const targetProjectId = process.argv.find((value, index, args) => args[index - 1] === '--target');
const apply = process.argv.includes('--apply');

const ALLOWED_TARGETS = new Set(['hypezone-dashboard-dev', 'hypezone-dashboard-prod']);
const PUBLIC_FIELDS = new Set([
  'nombre', 'marca', 'categoria', 'descripcion', 'talla', 'color', 'genero',
  'precioVenta', 'precioOferta', 'estado', 'imagenes', 'imagen', 'codigo',
  'activo', 'createdAt', 'updatedAt', 'productoId',
]);

function fail(message) {
  throw new Error(`[migrate-public-products] ${message}`);
}

function firebaseToolsModule(relativePath) {
  const globalModules = path.join(path.dirname(process.execPath), 'node_modules');
  return require(path.join(globalModules, 'firebase-tools', relativePath));
}

async function accessToken() {
  const auth = firebaseToolsModule('lib/auth.js');
  const account = auth.getProjectDefaultAccount(root) ?? auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) fail('No hay una sesión autenticada en Firebase CLI. Ejecuta firebase login.');
  const tokens = await auth.getAccessToken(account.tokens.refresh_token, []);
  return tokens.access_token;
}

async function firestoreRequest(projectId, token, method, suffix, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${suffix}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) fail(`${method} ${projectId}/${suffix} devolvió ${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function allPublicProducts(token) {
  const documents = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await firestoreRequest(sourceProjectId, token, 'GET', `productosPublicos?${query}`);
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}

function publicFields(fields) {
  const result = {};
  for (const [field, value] of Object.entries(fields ?? {})) {
    if (PUBLIC_FIELDS.has(field)) result[field] = value;
  }
  if (!result.activo) result.activo = { booleanValue: true };
  if (!result.estado) result.estado = { stringValue: 'disponible' };
  if (!result.imagenes && result.imagen) {
    result.imagenes = result.imagen.stringValue
      ? { arrayValue: { values: [{ stringValue: result.imagen.stringValue }] } }
      : result.imagen;
  }
  delete result.imagen;
  return result;
}

function statusOf(document) {
  return document.fields?.estado?.stringValue ?? 'sin estado';
}

async function main() {
  if (!sourceProjectId || !targetProjectId) fail('Uso: --source <proyecto-origen> --target <proyecto-destino> [--apply].');
  if (sourceProjectId !== 'hypezone-3ed2a') fail('El origen permitido para esta migración es hypezone-3ed2a.');
  if (!ALLOWED_TARGETS.has(targetProjectId)) fail('El destino debe ser hypezone-dashboard-dev o hypezone-dashboard-prod.');
  if (sourceProjectId === targetProjectId) fail('El origen y el destino deben ser distintos.');

  const token = await accessToken();
  const products = await allPublicProducts(token);
  const status = products.reduce((summary, product) => {
    const value = statusOf(product);
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});

  console.log(`Origen: ${sourceProjectId}/productosPublicos`);
  console.log(`Destino: ${targetProjectId}/productosPublicos`);
  console.log(`Documentos encontrados: ${products.length}`);
  console.log(`Por estado: ${Object.entries(status).map(([name, count]) => `${name}=${count}`).join(', ') || 'sin documentos'}`);
  console.log('Los IDs se conservan. Se importan disponibles, vendidos y cualquier otro estado.');
  console.log('No se lee, escribe ni elimina ninguna colección diferente de productosPublicos.');

  if (!apply) {
    console.log('Vista previa completada; no se realizó ninguna escritura. Añade --apply para importar.');
    return;
  }

  for (const product of products) {
    const id = product.name.split('/').at(-1);
    if (!id) fail('Se encontró un documento sin ID.');
    const fields = publicFields(product.fields);
    fields.productoId = { stringValue: id };
    await firestoreRequest(targetProjectId, token, 'PATCH', `productosPublicos/${encodeURIComponent(id)}`, { fields });
  }

  console.log(`Migración completada: ${products.length} documentos importados en ${targetProjectId}/productosPublicos.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
