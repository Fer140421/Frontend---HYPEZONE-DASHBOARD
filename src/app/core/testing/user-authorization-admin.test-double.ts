import { signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { PERMISSION_KEYS, PermissionKey } from '../authorization/permission-catalog';
import { UserProfile } from '../models/user-profile.model';
import { CreateUserCommand, UpdateUserAuthorizationCommand, UserAuthorizationLoadOptions } from '../services/user-authorization-admin.service';

const RECORDS: UserProfile[] = [
  { uid: 'local-owner', displayName: 'Ana Owner', email: 'ana.owner@local.test', roleId: 'owner', active: true, protectedOwner: true, permissionOverrides: {} },
  { uid: 'local-admin', displayName: 'Bruno Admin', email: 'bruno.admin@local.test', roleId: 'admin', active: true, permissionOverrides: { 'products.delete': true } },
  { uid: 'local-seller', displayName: 'Carla Seller', email: 'carla.seller@local.test', roleId: 'seller', active: true, permissionOverrides: { 'clients.create': true }, effectivePermissions: { 'products.delete': false, 'sales.create': true, 'products.create': false } },
  { uid: 'local-inactive', displayName: 'Diego Inactivo', email: 'diego.inactivo@local.test', roleId: 'seller', active: false, permissionOverrides: { 'sales.create': false } },
];

export class UserAuthorizationAdminTestDouble {
  readonly users = signal(structuredClone(RECORDS));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  simulateFailure = false;

  loadUsers(options: UserAuthorizationLoadOptions & { delayMs?: number; simulateFailure?: boolean; simulateEmpty?: boolean } = {}): Observable<UserProfile[]> {
    this.loading.set(true); this.error.set(null);
    return new Observable<UserProfile[]>((subscriber) => {
      if (options.simulateFailure) {
        this.error.set('No se pudieron cargar los usuarios locales.'); this.loading.set(false);
        subscriber.error(new Error('No se pudieron cargar los usuarios locales.')); return;
      }
      const records = options.simulateEmpty ? [] : structuredClone(RECORDS);
      const timer = setTimeout(() => { this.users.set(records); this.loading.set(false); subscriber.next(structuredClone(records)); subscriber.complete(); }, options.delayMs ?? 0);
      return () => clearTimeout(timer);
    });
  }

  async updateUserAuthorization(command: UpdateUserAuthorizationCommand): Promise<UserProfile> {
    const current = this.users().find((user) => user.uid === command.uid);
    if (!current) throw new Error('Usuario no encontrado en la fuente local.');
    if (current.protectedOwner && (command.roleId !== 'owner' || !command.active)) throw new Error('El owner protegido no puede desactivarse ni cambiar de rol.');
    if (Object.keys(command.permissionOverrides).some((key) => !PERMISSION_KEYS.includes(key as PermissionKey))) throw new Error('La solicitud contiene un permiso desconocido.');
    if (current.protectedOwner && ['dashboard.view', 'users.view', 'permissions.managePermissions'].some((key) => command.permissionOverrides[key as PermissionKey] === false)) throw new Error('El owner protegido no puede perder permisos críticos.');
    if (this.simulateFailure) throw new Error('Error local simulado.');
    const updated = { ...current, roleId: command.roleId, active: command.active, permissionOverrides: { ...command.permissionOverrides } };
    this.users.update((users) => users.map((user) => user.uid === updated.uid ? updated : user));
    return updated;
  }

  async createUser(_command: CreateUserCommand): Promise<never> { return Promise.reject(new Error('No disponible en el doble de pruebas.')); }
}
