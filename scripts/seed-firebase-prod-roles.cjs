'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const expectedProjectId = 'hypezone-3ed2a';
const requestedProjectId = process.argv.find((value, index, args) => args[index - 1] === '--project');
const apply = process.argv.includes('--apply');

function fail(message) {
  throw new Error(`[seed-firebase-prod] ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function validateProdTarget() {
  const aliases = readJson('.firebaserc').projects ?? {};
  if (aliases.prod !== expectedProjectId) {
    fail(`.firebaserc prod alias debe ser ${expectedProjectId}; se detectó ${aliases.prod ?? '(vacío)'}.`);
  }

  const activeProjectId = execFileSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['use'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();

  if (activeProjectId !== expectedProjectId && activeProjectId !== aliases.prod) {
    fail(`El proyecto activo en Firebase CLI es ${activeProjectId}, pero se esperaba ${expectedProjectId}. Ejecuta 'firebase use prod' primero.`);
  }

  return { activeProjectId, expectedProjectId };
}

function loadPermissionCatalog() {
  const source = fs.readFileSync(path.join(root, 'src/app/core/authorization/permission-catalog.ts'), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', javascript)(exports, require);
  return exports;
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

function encode(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  }
  fail(`Tipo Firestore no soportado en el seed: ${typeof value}.`);
}

function fields(value) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
}

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}

function decodeDocument(document) {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]));
}

async function firestoreRequest(token, method, suffix, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${expectedProjectId}/databases/(default)/documents/${suffix}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) fail(`${method} ${suffix} devolvió ${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

async function findOwner(token) {
  const result = await firestoreRequest(token, 'GET', 'users?pageSize=1000');
  const owners = (result.documents ?? []).filter((document) => {
    const user = decodeDocument(document);
    return user.role === 'owner' || user.roleId === 'owner' || user.email === 'fcamata77@gmail.com';
  });
  if (!owners.length) fail('No se encontró ningún usuario con rol owner en la colección users de PROD.');
  return owners[0];
}

function samePermissions(actual, expected) {
  if (!actual || typeof actual !== 'object') return false;
  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => actual[key] === expected[key]);
}

async function main() {
  const detected = validateProdTarget();
  const { PERMISSION_KEYS, defaultPermissions } = loadPermissionCatalog();
  const rolePermissions = {
    owner: defaultPermissions('owner'),
    admin: defaultPermissions('admin'),
    seller: defaultPermissions('seller'),
  };
  if (Object.keys(rolePermissions.owner).length !== PERMISSION_KEYS.length || !Object.values(rolePermissions.owner).every(Boolean)) {
    fail('El mapa owner no coincide con todos los PermissionKey del catálogo.');
  }

  const token = await accessToken();
  const ownerDocument = await findOwner(token);
  const ownerUid = ownerDocument.name.split('/').at(-1);
  const roles = {
    owner: { name: 'Owner', description: 'Acceso completo del propietario protegido.', active: true, system: true, permissions: rolePermissions.owner },
    admin: { name: 'Admin', description: 'Administración operativa según el catálogo de permisos.', active: true, system: true, permissions: rolePermissions.admin },
    seller: { name: 'Seller', description: 'Operación comercial según el catálogo de permisos.', active: true, system: true, permissions: rolePermissions.seller },
  };
  const ownerPatch = {
    roleId: 'owner',
    role: 'owner',
    active: true,
    protectedOwner: true,
    permissionOverrides: {},
    effectivePermissions: rolePermissions.owner,
  };

  console.log(`projectId detectado: ${detected.activeProjectId}`);
  console.log('Documentos planificados para PRODUCCIÓN:');
  console.log('  CREAR/REEMPLAZAR roles/owner');
  console.log('  CREAR/REEMPLAZAR roles/admin');
  console.log('  CREAR/REEMPLAZAR roles/seller');
  console.log(`  ACTUALIZAR users/${ownerUid} (agrega/actualiza role, roleId, active, protectedOwner, permissionOverrides y effectivePermissions)`);

  if (!apply) {
    console.log('Vista previa completada. No se realizaron escrituras en PROD. Usa --apply para ejecutar el seed en PROD.');
    return;
  }

  for (const [roleId, role] of Object.entries(roles)) {
    await firestoreRequest(token, 'PATCH', `roles/${roleId}`, { fields: fields(role) });
  }
  const updateMask = Object.keys(ownerPatch).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  await firestoreRequest(token, 'PATCH', `users/${ownerUid}?${updateMask}`, { fields: fields(ownerPatch) });

  for (const [roleId, expected] of Object.entries(roles)) {
    const actual = decodeDocument(await firestoreRequest(token, 'GET', `roles/${roleId}`));
    if (!actual.active || !actual.system || !samePermissions(actual.permissions, expected.permissions)) fail(`Falló la verificación de roles/${roleId}.`);
  }
  const owner = decodeDocument(await firestoreRequest(token, 'GET', `users/${ownerUid}`));
  if (owner.role !== 'owner' || owner.roleId !== 'owner' || owner.active !== true || owner.protectedOwner !== true || !samePermissions(owner.permissionOverrides, {}) || !samePermissions(owner.effectivePermissions, rolePermissions.owner)) {
    fail(`Falló la verificación de users/${ownerUid}.`);
  }
  console.log('Seed de Roles y Permisos de Owner aplicado y verificado CORRECTAMENTE en Firebase PROD (hypezone-3ed2a).');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
