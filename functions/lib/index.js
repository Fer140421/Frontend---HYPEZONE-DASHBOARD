"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserAuthorization = exports.createUser = void 0;
const node_crypto_1 = require("node:crypto");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const permissions_1 = require("./permissions");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
const auth = (0, auth_1.getAuth)();
const db = (0, firestore_1.getFirestore)();
const roles = new Set(['owner', 'admin', 'seller']);
const criticalOwnerKeys = ['dashboard.view', 'users.view', 'permissions.managePermissions'];
function requireAuth(request) {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    return uid;
}
async function assertCanManageUsers(uid) {
    const snapshot = await db.doc(`users/${uid}`).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.active !== true) {
        throw new https_1.HttpsError('permission-denied', 'El usuario no existe o está inactivo.');
    }
    const roleId = (data.roleId ?? data.role);
    if (!roles.has(roleId)) {
        throw new https_1.HttpsError('permission-denied', 'El rol del usuario es inválido.');
    }
    const rolePerms = await rolePermissions(roleId);
    const overrides = validateOverrides(data.permissionOverrides);
    const permissions = (0, permissions_1.effectivePermissions)(roleId, rolePerms, overrides);
    if (permissions['permissions.managePermissions'] !== true) {
        throw new https_1.HttpsError('permission-denied', 'No tienes permissions.managePermissions.');
    }
}
function payload(request) {
    if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
        throw new https_1.HttpsError('invalid-argument', 'El payload es inválido.');
    }
    return request.data;
}
function validateOverrides(value) {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value))
        throw new https_1.HttpsError('invalid-argument', 'Overrides inválidos.');
    const result = {};
    for (const [key, enabled] of Object.entries(value)) {
        if (!(0, permissions_1.isPermissionKey)(key) || typeof enabled !== 'boolean')
            throw new https_1.HttpsError('invalid-argument', 'Permiso inválido.');
        result[key] = enabled;
    }
    return result;
}
async function rolePermissions(roleId) {
    const snapshot = await db.doc(`roles/${roleId}`).get();
    if (!snapshot.exists)
        return {};
    if (snapshot.data()?.active !== true) {
        throw new https_1.HttpsError('failed-precondition', 'El rol solicitado no está activo.');
    }
    return (0, permissions_1.knownPermissions)(snapshot.data()?.permissions);
}
function temporaryPassword() { return `Hz-${(0, node_crypto_1.randomBytes)(18).toString('base64url')}`; }
function profilePayload(input, permissions) {
    const now = firestore_1.Timestamp.now();
    return {
        uid: input.uid, email: input.email, displayName: input.displayName, roleId: input.roleId,
        active: input.active, permissionOverrides: input.overrides, effectivePermissions: permissions,
        protectedOwner: false, createdAt: input.created ? now : firestore_1.FieldValue.serverTimestamp(), updatedAt: now,
        ...(input.created ? { createdBy: input.actorUid } : { updatedBy: input.actorUid }),
    };
}
exports.createUser = (0, https_1.onCall)(async (request) => {
    const actorUid = requireAuth(request);
    await assertCanManageUsers(actorUid);
    const data = payload(request);
    const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const roleId = data.roleId;
    const active = data.active === true;
    if (displayName.length < 2 || displayName.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || !roles.has(roleId) || typeof data.active !== 'boolean')
        throw new https_1.HttpsError('invalid-argument', 'Nombre, correo, estado o rol inválido.');
    const overrides = validateOverrides(data.permissionOverrides);
    const permissions = (0, permissions_1.effectivePermissions)(roleId, await rolePermissions(roleId), overrides);
    const password = temporaryPassword();
    let createdUid = null;
    try {
        const account = await auth.createUser({ displayName, email, password, disabled: !active });
        createdUid = account.uid;
        const profile = profilePayload({ uid: account.uid, displayName, email, roleId, active, overrides, actorUid, created: true }, permissions);
        await db.doc(`users/${account.uid}`).set(profile);
        return { user: { ...profile, temporaryPassword: password } };
    }
    catch (error) {
        if (createdUid)
            await auth.deleteUser(createdUid).catch(() => undefined);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError('already-exists', 'No se pudo crear la cuenta. El correo podría estar registrado.');
    }
});
exports.updateUserAuthorization = (0, https_1.onCall)(async (request) => {
    const actorUid = requireAuth(request);
    await assertCanManageUsers(actorUid);
    const data = payload(request);
    const uid = typeof data.uid === 'string' ? data.uid : '';
    const roleId = data.roleId;
    const active = data.active === true;
    if (!uid || !roles.has(roleId) || typeof data.active !== 'boolean')
        throw new https_1.HttpsError('invalid-argument', 'Usuario, estado o rol inválido.');
    const overrides = validateOverrides(data.permissionOverrides);
    if (uid === actorUid && (roleId !== 'owner' || !active || criticalOwnerKeys.some((key) => overrides[key] === false)))
        throw new https_1.HttpsError('failed-precondition', 'No puedes reducir tus propios privilegios.');
    const targetRef = db.doc(`users/${uid}`);
    const permissions = (0, permissions_1.effectivePermissions)(roleId, await rolePermissions(roleId), overrides);
    const saved = await db.runTransaction(async (transaction) => {
        const target = await transaction.get(targetRef);
        if (!target.exists)
            throw new https_1.HttpsError('not-found', 'Usuario no encontrado.');
        const current = target.data();
        const protectedOwner = current.protectedOwner === true;
        if (protectedOwner && (roleId !== 'owner' || !active || criticalOwnerKeys.some((key) => overrides[key] === false)))
            throw new https_1.HttpsError('failed-precondition', 'El owner protegido no puede perder sus privilegios.');
        if ((current.roleId === 'owner' || current.role === 'owner') && roleId !== 'owner') {
            const activeUsers = await transaction.get(db.collection('users').where('active', '==', true));
            const ownerCount = activeUsers.docs.filter((item) => {
                const profile = item.data();
                return profile.roleId === 'owner' || profile.role === 'owner';
            }).length;
            if (ownerCount <= 1)
                throw new https_1.HttpsError('failed-precondition', 'Debe existir al menos un owner activo.');
        }
        const profile = profilePayload({ uid, displayName: current.displayName ?? 'Usuario', email: current.email ?? '', roleId, active, overrides, actorUid, created: false }, permissions);
        profile.createdAt = current.createdAt ?? firestore_1.Timestamp.now();
        transaction.set(targetRef, { ...profile, protectedOwner }, { merge: true });
        return { ...current, ...profile, protectedOwner };
    });
    await auth.updateUser(uid, { disabled: !active, displayName: saved.displayName, email: saved.email });
    return { user: saved };
});
