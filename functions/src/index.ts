import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { effectivePermissions, isPermissionKey, knownPermissions, PermissionKey, UserRole } from './permissions';

if (!getApps().length) initializeApp();
const auth = getAuth();
const db = getFirestore();
const roles = new Set<UserRole>(['owner', 'admin', 'seller']);
const criticalOwnerKeys: PermissionKey[] = ['dashboard.view', 'users.view', 'permissions.managePermissions'];

interface UserProfile {
  uid: string; email: string; displayName: string; roleId: UserRole; active: boolean;
  permissionOverrides: Partial<Record<PermissionKey, boolean>>;
  effectivePermissions: Record<PermissionKey, boolean>; protectedOwner: boolean;
  createdAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue;
  createdBy?: string; updatedBy?: string;
}
type Request = { auth?: { uid: string } | null; data: unknown };

function requireAuth(request: Request): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  return uid;
}
async function assertCanManageUsers(uid: string): Promise<void> {
  const snapshot = await db.doc(`users/${uid}`).get();
  const data = snapshot.data();
  if (!snapshot.exists || data?.active !== true) {
    throw new HttpsError('permission-denied', 'El usuario no existe o está inactivo.');
  }
  const roleId = (data.roleId ?? data.role) as UserRole;
  if (!roles.has(roleId)) {
    throw new HttpsError('permission-denied', 'El rol del usuario es inválido.');
  }
  const rolePerms = await rolePermissions(roleId);
  const overrides = validateOverrides(data.permissionOverrides);
  const permissions = effectivePermissions(roleId, rolePerms, overrides);
  if (permissions['permissions.managePermissions'] !== true) {
    throw new HttpsError('permission-denied', 'No tienes permissions.managePermissions.');
  }
}

function payload(request: Request): Record<string, unknown> {
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
    throw new HttpsError('invalid-argument', 'El payload es inválido.');
  }
  return request.data as Record<string, unknown>;
}
function validateOverrides(value: unknown): Partial<Record<PermissionKey, boolean>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Overrides inválidos.');
  const result: Partial<Record<PermissionKey, boolean>> = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (!isPermissionKey(key) || typeof enabled !== 'boolean') throw new HttpsError('invalid-argument', 'Permiso inválido.');
    result[key] = enabled;
  }
  return result;
}
async function rolePermissions(roleId: UserRole): Promise<Partial<Record<PermissionKey, boolean>>> {
  const snapshot = await db.doc(`roles/${roleId}`).get();
  if (!snapshot.exists) return {};
  if (snapshot.data()?.active !== true) {
    throw new HttpsError('failed-precondition', 'El rol solicitado no está activo.');
  }
  return knownPermissions(snapshot.data()?.permissions);
}
function temporaryPassword(): string { return `Hz-${randomBytes(18).toString('base64url')}`; }
function profilePayload(input: { uid: string; displayName: string; email: string; roleId: UserRole; active: boolean; overrides: Partial<Record<PermissionKey, boolean>>; actorUid: string; created: boolean }, permissions: Record<PermissionKey, boolean>): UserProfile {
  const now = Timestamp.now();
  return {
    uid: input.uid, email: input.email, displayName: input.displayName, roleId: input.roleId,
    active: input.active, permissionOverrides: input.overrides, effectivePermissions: permissions,
    protectedOwner: false, createdAt: input.created ? now : FieldValue.serverTimestamp(), updatedAt: now,
    ...(input.created ? { createdBy: input.actorUid } : { updatedBy: input.actorUid }),
  };
}

export const createUser = onCall(async (request) => {
  const actorUid = requireAuth(request); await assertCanManageUsers(actorUid);
  const data = payload(request);
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const roleId = data.roleId as UserRole; const active = data.active === true;
  if (displayName.length < 2 || displayName.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || !roles.has(roleId) || typeof data.active !== 'boolean') throw new HttpsError('invalid-argument', 'Nombre, correo, estado o rol inválido.');
  const overrides = validateOverrides(data.permissionOverrides);
  const permissions = effectivePermissions(roleId, await rolePermissions(roleId), overrides);
  const password = temporaryPassword(); let createdUid: string | null = null;
  try {
    const account = await auth.createUser({ displayName, email, password, disabled: !active }); createdUid = account.uid;
    const profile = profilePayload({ uid: account.uid, displayName, email, roleId, active, overrides, actorUid, created: true }, permissions);
    await db.doc(`users/${account.uid}`).set(profile);
    return { user: { ...profile, temporaryPassword: password } };
  } catch (error) {
    if (createdUid) await auth.deleteUser(createdUid).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('already-exists', 'No se pudo crear la cuenta. El correo podría estar registrado.');
  }
});

export const updateUserAuthorization = onCall(async (request) => {
  const actorUid = requireAuth(request); await assertCanManageUsers(actorUid);
  const data = payload(request);
  const uid = typeof data.uid === 'string' ? data.uid : ''; const roleId = data.roleId as UserRole; const active = data.active === true;
  if (!uid || !roles.has(roleId) || typeof data.active !== 'boolean') throw new HttpsError('invalid-argument', 'Usuario, estado o rol inválido.');
  const overrides = validateOverrides(data.permissionOverrides);
  if (uid === actorUid && (roleId !== 'owner' || !active || criticalOwnerKeys.some((key) => overrides[key] === false))) throw new HttpsError('failed-precondition', 'No puedes reducir tus propios privilegios.');
  const targetRef = db.doc(`users/${uid}`); const permissions = effectivePermissions(roleId, await rolePermissions(roleId), overrides);
  const saved = await db.runTransaction(async (transaction) => {
    const target = await transaction.get(targetRef); if (!target.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
    const current = target.data()!; const protectedOwner = current.protectedOwner === true;
    if (protectedOwner && (roleId !== 'owner' || !active || criticalOwnerKeys.some((key) => overrides[key] === false))) throw new HttpsError('failed-precondition', 'El owner protegido no puede perder sus privilegios.');
    if ((current.roleId === 'owner' || current.role === 'owner') && roleId !== 'owner') {
      const activeUsers = await transaction.get(db.collection('users').where('active', '==', true));
      const ownerCount = activeUsers.docs.filter((item) => {
        const profile = item.data();
        return profile.roleId === 'owner' || profile.role === 'owner';
      }).length;
      if (ownerCount <= 1) throw new HttpsError('failed-precondition', 'Debe existir al menos un owner activo.');
    }
    const profile = profilePayload({ uid, displayName: current.displayName ?? 'Usuario', email: current.email ?? '', roleId, active, overrides, actorUid, created: false }, permissions);
    profile.createdAt = current.createdAt ?? Timestamp.now();
    transaction.set(targetRef, { ...profile, protectedOwner }, { merge: true }); return { ...current, ...profile, protectedOwner } as UserProfile;
  });
  await auth.updateUser(uid, { disabled: !active, displayName: saved.displayName, email: saved.email });
  return { user: saved };
});
