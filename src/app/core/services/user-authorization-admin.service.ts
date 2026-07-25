import { Injectable, inject, signal } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, catchError, defer, finalize, map, shareReplay, throwError } from 'rxjs';
import { PERMISSION_KEYS, PermissionKey } from '../authorization/permission-catalog';
import { UserProfile, UserRole } from '../models/user-profile.model';

export type UserAuthorizationAdminRecord = UserProfile;
export interface UserAuthorizationLoadOptions { readonly forceRefresh?: boolean; }
export interface UpdateUserAuthorizationCommand { uid: string; roleId: string; active: boolean; permissionOverrides: Partial<Record<PermissionKey, boolean>>; }
export interface CreateUserCommand { displayName: string; email: string; roleId: UserRole; active: boolean; permissionOverrides: Partial<Record<PermissionKey, boolean>>; }
export interface CreatedUserResult extends UserProfile { temporaryPassword: string; }
interface CallableResult<T> { user: T; }

const LOAD_ERROR_MESSAGE = 'No se pudieron cargar los usuarios desde Firebase.';

@Injectable({ providedIn: 'root' })
export class UserAuthorizationAdminService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  readonly users = signal<UserAuthorizationAdminRecord[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  loadUsers(_options: UserAuthorizationLoadOptions = {}): Observable<UserAuthorizationAdminRecord[]> {
    return defer(() => {
      this.loading.set(true);
      this.error.set(null);
      return collectionData(collection(this.firestore, 'users'), { idField: 'id' }).pipe(
        map((records) => this.normalizeRecords(records as UserAuthorizationAdminRecord[])),
        map((records) => { this.users.set(records); return records; }),
        catchError((error: unknown) => {
          const controlled = error instanceof Error ? error : new Error(LOAD_ERROR_MESSAGE);
          this.error.set(controlled.message || LOAD_ERROR_MESSAGE);
          return throwError(() => controlled);
        }),
        finalize(() => this.loading.set(false)),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    });
  }

  async updateUserAuthorization(command: UpdateUserAuthorizationCommand): Promise<UserProfile> {
    const callable = httpsCallable<UpdateUserAuthorizationCommand, CallableResult<UserProfile>>(
      this.functions, 'updateUserAuthorization',
    );
    const saved = (await callable(this.normalizeUpdate(command))).data.user;
    this.replaceUser(saved);
    return saved;
  }

  async createUser(command: CreateUserCommand): Promise<CreatedUserResult> {
    const callable = httpsCallable<CreateUserCommand, CallableResult<CreatedUserResult>>(
      this.functions, 'createUser',
    );
    const created = (await callable(this.normalizeCreate(command))).data.user;
    this.users.update((users) => this.sortRecords([...users, created]));
    return created;
  }

  private normalizeUpdate(command: UpdateUserAuthorizationCommand): UpdateUserAuthorizationCommand {
    return { uid: command.uid, roleId: command.roleId.trim(), active: command.active === true, permissionOverrides: this.normalizeOverrides(command.permissionOverrides) };
  }
  private normalizeCreate(command: CreateUserCommand): CreateUserCommand {
    return { displayName: command.displayName.trim(), email: command.email.trim().toLowerCase(), roleId: command.roleId, active: command.active === true, permissionOverrides: this.normalizeOverrides(command.permissionOverrides) };
  }
  private normalizeOverrides(overrides: Partial<Record<PermissionKey, boolean>>): Partial<Record<PermissionKey, boolean>> {
    return Object.fromEntries(PERMISSION_KEYS.flatMap((key) => typeof overrides[key] === 'boolean' ? [[key, overrides[key]] as const] : [])) as Partial<Record<PermissionKey, boolean>>;
  }
  private normalizeRecords(records: UserAuthorizationAdminRecord[]): UserAuthorizationAdminRecord[] {
    return this.sortRecords(records.map((record) => ({
      ...record,
      displayName: record.displayName?.trim() || 'Usuario sin nombre',
      email: record.email?.trim() || 'Sin correo',
      roleId: record.roleId ?? record.role ?? 'seller',
      active: record.active === true,
      permissionOverrides: this.normalizeOverrides(record.permissionOverrides ?? {}),
    })));
  }
  private sortRecords(records: UserAuthorizationAdminRecord[]): UserAuthorizationAdminRecord[] {
    return records.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es') || a.email.localeCompare(b.email, 'es'));
  }
  private replaceUser(saved: UserProfile): void {
    this.users.update((users) => this.sortRecords(users.map((user) => user.uid === saved.uid ? saved : user)));
  }
}
