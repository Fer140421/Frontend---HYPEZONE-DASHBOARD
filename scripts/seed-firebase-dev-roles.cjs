'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const expectedProjectId = 'hypezone-dev';
const requestedProjectId = process.argv.find((value, index, args) => args[index - 1] === '--project');
const apply = process.argv.includes('--apply');

function fail(message) {
  throw new Error(`[seed-firebase-dev] ${message}`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function validateDevTarget() {
  const environmentSource = fs.readFileSync(path.join(root, 'src/environments/environment.development.ts'), 'utf8');
  const environmentProjectId = environmentSource.match(/projectId:\s*['"]([^'"]+)['"]/)?.[1];
  const production = environmentSource.match(/production:\s*(true|false)/)?.[1];
  const environmentName = environmentSource.match(/environmentName:\s*['"]([^'"]+)['"]/)?.[1];
  const aliases = readJson('.firebaserc').projects ?? {};
  const activeProjectId = execFileSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', ['use'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();

  const detected = { requestedProjectId, environmentProjectId, activeProjectId, devAlias: aliases.dev, prodAlias: aliases.prod };
  for (const [source, projectId] of Object.entries(detected)) {
    if (source !== 'prodAlias' && projectId !== expectedProjectId) {
      fail(`${source} debe ser ${expectedProjectId}; se detectó ${projectId ?? '(vacío)'}.`);
    }
  }
  if (production !== 'false' || environmentName !== 'DEV') fail('environment.development.ts no está marcado como DEV no productivo.');
  if (aliases.prod === expectedProjectId || Object.values(detected).some((value) => typeof value === 'string' && /prod/i.test(value) && value !== aliases.prod)) {
    fail('Se detectó una referencia PROD en el destino solicitado.');
  }
  return detected;
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
  if (!account?.tokens?.refresh_token) fail('No hay una sesión autenticada en Firebase CLI.');
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
    return user.role === 'owner' || user.roleId === 'owner';
  });
  if (owners.length !== 1) fail(`Se esperaba exactamente un usuario owner y se encontraron ${owners.length}.`);
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
  const detected = validateDevTarget();
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
    active: true,
    protectedOwner: true,
    permissionOverrides: {},
    effectivePermissions: rolePermissions.owner,
  };

  console.log(`projectId detectado: ${detected.activeProjectId}`);
  console.log('Documentos planificados:');
  console.log('  CREAR/REEMPLAZAR roles/owner');
  console.log('  CREAR/REEMPLAZAR roles/admin');
  console.log('  CREAR/REEMPLAZAR roles/seller');
  console.log(`  ACTUALIZAR users/${ownerUid} (conserva role; agrega/actualiza roleId, active, protectedOwner, permissionOverrides y effectivePermissions)`);

  if (!apply) {
    console.log('Vista previa completada. No se realizaron escrituras. Usa --apply para ejecutar el seed.');
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
  console.log('Seed aplicado y verificado correctamente en Firebase DEV.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
