'use strict';

/*
 * Rebuilds loyalty balances from the active sales history. It is deliberately
 * dry-run by default; writing requires both --apply and --confirm-project.
 */

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const apply = process.argv.includes('--apply');
const option = (name) => process.argv.find((value, index, args) => args[index - 1] === name);
const requestedProjectId = option('--project');
const confirmation = option('--confirm-project');

function fail(message) {
  throw new Error(`[rebuild-fidelity-points] ${message}`);
}

function firebaseToolsModule(relativePath) {
  const globalModules = path.join(path.dirname(process.execPath), 'node_modules');
  return require(path.join(globalModules, 'firebase-tools', relativePath));
}

function activeProjectId() {
  if (requestedProjectId) return requestedProjectId;
  return execFileSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['use'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
}

async function accessToken() {
  const auth = firebaseToolsModule('lib/auth.js');
  const account = auth.getProjectDefaultAccount(root) ?? auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) fail('No hay una sesión autenticada en Firebase CLI. Ejecuta firebase login.');
  return (await auth.getAccessToken(account.tokens.refresh_token, [])).access_token;
}

async function firestoreRequest(projectId, token, method, suffix, body, allowNotFound = false) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${suffix}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (allowNotFound && response.status === 404) return undefined;
  if (!response.ok) fail(`${method} ${suffix} devolvió ${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function listDocuments(projectId, token, collection) {
  const documents = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await firestoreRequest(projectId, token, 'GET', `${collection}?${query}`);
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  return undefined;
}

function documentData(document) {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]));
}

function numberField(value) {
  return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
}

function documentId(document) {
  return document.name.split('/').at(-1);
}

async function patchFields(projectId, token, collection, id, fields) {
  const mask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  await firestoreRequest(projectId, token, 'PATCH', `${collection}/${id}?${mask}`, { fields });
}

async function main() {
  const projectId = activeProjectId();
  if (!projectId) fail('No se pudo determinar el proyecto. Usa --project <id>.');
  if (apply && confirmation !== projectId) {
    fail(`Para escribir en ${projectId} debes indicar --apply --confirm-project ${projectId}.`);
  }

  const token = await accessToken();
  const configDocument = await firestoreRequest(projectId, token, 'GET', 'configuracion/fidelidad', undefined, true);
  const config = configDocument ? documentData(configDocument) : {};
  const puntosPorPrenda = Number(config.puntosPorPrenda ?? 10);
  const puntosParaRecompensa = Number(config.puntosParaRecompensa ?? 100);
  if (!Number.isFinite(puntosPorPrenda) || puntosPorPrenda < 0 || !Number.isFinite(puntosParaRecompensa) || puntosParaRecompensa <= 0) {
    fail('La configuración de fidelidad es inválida. Revisa puntosPorPrenda y puntosParaRecompensa.');
  }

  const [clientes, ventas] = await Promise.all([
    listDocuments(projectId, token, 'clientes'),
    listDocuments(projectId, token, 'ventas'),
  ]);
  const clientesPorId = new Map(clientes.map((cliente) => [documentId(cliente), cliente]));
  const resumenPorCliente = new Map();
  const ventasParaMarcar = [];
  let ventasSinCliente = 0;
  let ventasClienteInexistente = 0;

  for (const venta of ventas) {
    const data = documentData(venta);
    if (data.activo === false) continue;
    if (!data.clienteId) {
      ventasSinCliente++;
      continue;
    }
    if (!clientesPorId.has(data.clienteId)) {
      ventasClienteInexistente++;
      continue;
    }
    const resumen = resumenPorCliente.get(data.clienteId) ?? { detalles: 0, recompensasCanjeadas: 0 };
    resumen.detalles++;
    if (data.recompensaCanjeada === true) resumen.recompensasCanjeadas++;
    resumenPorCliente.set(data.clienteId, resumen);
    ventasParaMarcar.push(documentId(venta));
  }

  const actualizaciones = [...resumenPorCliente.entries()].map(([clienteId, resumen]) => {
    const puntosAcumulados = resumen.detalles * puntosPorPrenda;
    const recompensasGeneradas = Math.floor(puntosAcumulados / puntosParaRecompensa);
    return {
      clienteId,
      detalles: resumen.detalles,
      puntosDisponibles: puntosAcumulados % puntosParaRecompensa,
      puntosAcumulados,
      recompensasDisponibles: Math.max(0, recompensasGeneradas - resumen.recompensasCanjeadas),
      recompensasCanjeadas: resumen.recompensasCanjeadas,
    };
  });

  console.log(`Proyecto: ${projectId}`);
  console.log(`Configuración usada: ${puntosPorPrenda} punto(s) por prenda; ${puntosParaRecompensa} puntos por recompensa.`);
  console.log(`Vista previa: ${actualizaciones.length} cliente(s), ${ventasParaMarcar.length} venta(s) y ${ventasSinCliente} venta(s) sin cliente.`);
  if (ventasClienteInexistente) console.log(`Advertencia: se omitieron ${ventasClienteInexistente} venta(s) cuyo cliente ya no existe.`);
  actualizaciones.slice(0, 20).forEach((item) => {
    console.log(`  clientes/${item.clienteId}: ${item.detalles} prenda(s) → ${item.puntosDisponibles} puntos, ${item.recompensasDisponibles} recompensa(s).`);
  });
  if (actualizaciones.length > 20) console.log(`  … y ${actualizaciones.length - 20} cliente(s) más.`);

  if (!apply) {
    console.log('No se realizaron escrituras. Revisa el resultado y vuelve a ejecutar con --apply --confirm-project <id>.');
    return;
  }

  for (const item of actualizaciones) {
    await patchFields(projectId, token, 'clientes', item.clienteId, {
      puntosDisponibles: numberField(item.puntosDisponibles),
      puntosAcumulados: numberField(item.puntosAcumulados),
      recompensasDisponibles: numberField(item.recompensasDisponibles),
    });
  }
  for (const ventaId of ventasParaMarcar) {
    await patchFields(projectId, token, 'ventas', ventaId, { puntosGanados: numberField(puntosPorPrenda) });
  }
  console.log(`Migración aplicada: ${actualizaciones.length} cliente(s) actualizados y ${ventasParaMarcar.length} venta(s) marcadas con puntosGanados.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
