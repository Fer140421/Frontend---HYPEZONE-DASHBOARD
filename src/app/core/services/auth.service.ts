import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth, User, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable, catchError, concat, filter, firstValueFrom, map, of, shareReplay, switchMap, take } from 'rxjs';
import { ALL_PERMISSIONS, PermissionKey, PermissionModule } from '../authorization/permission-catalog';
import { resolveEffectivePermissions } from '../authorization/effective-permissions';
import { Role } from '../models/role.model';
import { UserProfile, UserRole } from '../models/user-profile.model';
import { RoleRepository } from '../repositories/role.repository';
import { UserRepository } from '../repositories/user.repository';

export type Permission = PermissionKey;
export type SessionStatus = 'initializing' | 'unauthenticated' | 'loading-profile' | 'loading-role' | 'authenticated' | 'missing-profile' | 'inactive' | 'missing-role' | 'inactive-role' | 'error';
/** role/effectivePermissions remain optional to keep v1 test fixtures and adapters source-compatible. Runtime states always provide them. */
export interface SessionState { status: SessionStatus; user: User | null; profile: UserProfile | null; role?: Role | null; effectivePermissions?: Readonly<Record<PermissionKey, boolean>>; error?: unknown; }
const EMPTY = Object.fromEntries(Object.keys(ALL_PERMISSIONS).map((key) => [key, false])) as Readonly<Record<PermissionKey, boolean>>;
const terminal = (status: SessionStatus) => !['initializing', 'loading-profile', 'loading-role'].includes(status);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly users = inject(UserRepository);
  private readonly roles = inject(RoleRepository);

  readonly sessionState$: Observable<SessionState> = user(this.auth).pipe(
    switchMap((firebaseUser) => !firebaseUser
      ? of(this.state('unauthenticated', null, null, null))
      : concat(
          of(this.state('loading-profile', firebaseUser, null, null)),
          this.users.getProfile(firebaseUser.uid).pipe(
            switchMap((profile) => {
              if (!profile) return of(this.state('missing-profile', firebaseUser, null, null));
              if (!profile.active) return of(this.state('inactive', firebaseUser, profile, null));
              const roleId = profile.roleId ?? profile.role;
              if (!roleId) return of(this.state('missing-role', firebaseUser, profile, null));
              return concat(
                of(this.state('loading-role', firebaseUser, profile, null)),
                this.roles.getById(roleId).pipe(map((role) => this.resolveRole(firebaseUser, profile, role))),
              );
            }),
            catchError((error: unknown) => of(this.state('error', firebaseUser, null, null, error))),
          ),
        )),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly sessionState = toSignal(this.sessionState$, { initialValue: this.state('initializing', null, null, null) });
  readonly firebaseUser = computed(() => this.sessionState().user);
  readonly profile = computed(() => this.sessionState().profile);
  readonly roleDocument = computed(() => this.sessionState().role ?? null);
  readonly loading = computed(() => !terminal(this.sessionState().status));
  readonly authenticated = computed(() => this.sessionState().status === 'authenticated');
  readonly active = this.authenticated;
  readonly role = computed<UserRole | null>(() => (this.profile()?.roleId ?? this.profile()?.role ?? null) as UserRole | null);
  readonly isOwner = computed(() => this.role() === 'owner');
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isSeller = computed(() => this.role() === 'seller');
  readonly effectivePermissions = computed(() => this.sessionState().effectivePermissions ?? EMPTY);

  async login(email: string, password: string): Promise<SessionState> { const credential = await signInWithEmailAndPassword(this.auth, email, password); return firstValueFrom(this.sessionState$.pipe(filter((state) => state.user?.uid === credential.user.uid && terminal(state.status)), take(1))); }
  can(permission: Permission): boolean { return this.authenticated() && this.effectivePermissions()[permission] === true; }
  canAny(permissions: Permission[]): boolean { return permissions.some((permission) => this.can(permission)); }
  canAll(permissions: Permission[]): boolean { return permissions.every((permission) => this.can(permission)); }
  hasModuleAccess(module: PermissionModule): boolean { return Object.entries(this.effectivePermissions()).some(([key, granted]) => granted && key.startsWith(`${module}.`)); }
  async logout(): Promise<void> { try { await signOut(this.auth); await firstValueFrom(this.sessionState$.pipe(filter((state) => state.status === 'unauthenticated'), take(1))); } finally { await this.router.navigateByUrl('/auth/login', { replaceUrl: true }); } }

  private resolveRole(user: User, profile: UserProfile, role: Role | undefined): SessionState {
    if (!role) return this.state('missing-role', user, profile, null);
    if (!role.active) return this.state('inactive-role', user, profile, role);
    const effectivePermissions = resolveEffectivePermissions(profile, role);
    return { status: 'authenticated', user, profile, role, effectivePermissions: effectivePermissions as Readonly<Record<PermissionKey, boolean>> };
  }
  private state(status: SessionStatus, user: User | null, profile: UserProfile | null, role: Role | null, error?: unknown): SessionState { return { status, user, profile, role, effectivePermissions: EMPTY, error }; }
}
