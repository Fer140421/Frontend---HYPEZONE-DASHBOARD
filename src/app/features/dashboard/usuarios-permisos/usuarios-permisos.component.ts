import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Observable, finalize, map, shareReplay, startWith } from 'rxjs';
import {
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  PermissionKey,
} from '../../../core/authorization/permission-catalog';
import { UserProfile } from '../../../core/models/user-profile.model';
import { AuthService } from '../../../core/services/auth.service';
import {
  UpdateUserAuthorizationCommand,
  UserAuthorizationAdminService,
  UserAuthorizationLoadOptions,
} from '../../../core/services/user-authorization-admin.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';
import {
  UserAuthorizationEditDialogComponent,
  UserAuthorizationEditDialogData,
  UserAuthorizationOverrideValue,
} from './user-authorization-edit-dialog.component';
import {
  UserCreateDialogComponent,
  UserCreateDialogData,
} from './user-create-dialog.component';
import { CreateUserCommand } from '../../../core/services/user-authorization-admin.service';

@Component({
  selector: 'app-usuarios-permisos',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    EmptyStateComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './usuarios-permisos.html',
  styleUrl: './usuarios-permisos.css',
})
export class UsuariosPermisosComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly admin = inject(UserAuthorizationAdminService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly search = signal('');
  readonly roleFilter = signal<string>('');
  readonly activeFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly selected = signal<UserProfile | null>(null);
  readonly original = signal<UpdateUserAuthorizationCommand | null>(null);
  readonly saving = signal(false);
  private readonly selectionConfirmationOpen = signal(false);
  private readonly saveConfirmationOpen = signal(false);
  private navigationConfirmation$: Observable<boolean> | null = null;
  private editorDialogRef: MatDialogRef<UserAuthorizationEditDialogComponent> | null =
    null;
  private readonly pagination = signal<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly form = this.fb.nonNullable.group({
    roleId: [{ value: 'seller', disabled: true }],
    active: [{ value: true, disabled: true }],
  });
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );
  readonly users = computed(() => {
    const text = this.search().trim().toLowerCase();
    return this.admin.users().filter(
      (user) =>
        (!text || `${user.displayName} ${user.email}`.toLowerCase().includes(text)) &&
        (!this.roleFilter() || (user.roleId ?? user.role) === this.roleFilter()) &&
        (this.activeFilter() === 'all' ||
          (this.activeFilter() === 'active' ? user.active : !user.active)),
    );
  });
  readonly availableRoles = computed(() => ['owner', 'admin', 'seller']);
  readonly paginatedUsers = computed(() => paginateItems(this.users(), this.pagination()));
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly filtersActive = computed(
    () =>
      !!this.search().trim() || !!this.roleFilter() || this.activeFilter() !== 'all',
  );
  readonly permissions = PERMISSION_CATALOG;
  readonly dirty = computed(() => {
    const user = this.selected();
    const original = this.original();
    if (!user || !original) return false;

    return JSON.stringify(this.command(user, this.formValue())) !== JSON.stringify(original);
  });
  readonly canManage = computed(() => this.auth.can('permissions.managePermissions'));
  readonly canCreateUser = computed(
    () => this.canManage() && this.auth.can('users.create'),
  );
  private readonly formAccessEffect = effect(() => {
    this.syncFormAccess(this.selected());
  });

  ngOnInit(): void {
    this.retryLoadUsers();
  }

  retryLoadUsers(options?: UserAuthorizationLoadOptions): void {
    if (this.admin.loading()) return;
    this.admin
      .loadUsers(options)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  async openCreateUser(): Promise<void> {
    if (!this.canCreateUser()) return;
    const command = await this.dialog
      .open<UserCreateDialogComponent, UserCreateDialogData, CreateUserCommand>(
        UserCreateDialogComponent,
        {
          data: { permissions: this.permissions },
          width: 'min(860px, 96vw)',
          maxWidth: '96vw',
          maxHeight: '92vh',
          autoFocus: 'first-tabbable',
          restoreFocus: true,
          ariaLabel: 'Crear nuevo usuario',
        },
      )
      .afterClosed()
      .toPromise();
    if (!command) return;

    this.saving.set(true);
    try {
      const created = await this.admin.createUser(command);
      this.snack.open(`Usuario creado. Contraseña temporal: ${created.temporaryPassword}`, 'OK', {
        duration: 15000,
      });
    } catch {
      this.snack.open('No se pudo crear el usuario. Verifica los datos e inténtalo nuevamente.', 'OK');
    } finally {
      this.saving.set(false);
    }
  }

  confirmNavigationAway(): boolean | Observable<boolean> {
    if (!this.dirty()) return true;
    if (this.navigationConfirmation$) return this.navigationConfirmation$;

    this.navigationConfirmation$ = this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Cambios sin guardar',
          message:
            'Hay cambios sin guardar. Puedes permanecer en esta pantalla o descartarlos y salir.',
          cancelText: 'Permanecer',
          confirmText: 'Descartar y salir',
        },
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(
        map((confirmed) => confirmed === true),
        finalize(() => {
          this.navigationConfirmation$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    return this.navigationConfirmation$;
  }

  select(user: UserProfile): void {
    if (this.selected()?.uid === user.uid) {
      this.openEditor();
      return;
    }
    if (!this.dirty()) {
      this.applySelection(user);
      this.openEditor();
      return;
    }
    if (this.selectionConfirmationOpen()) return;

    this.selectionConfirmationOpen.set(true);
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Cambios sin guardar',
          message:
            'Hay cambios sin guardar. Si continúas, se descartarán los cambios del usuario actual.',
          cancelText: 'Cancelar',
          confirmText: 'Descartar y continuar',
        },
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (confirmed) => {
          if (!confirmed) return;
          this.applySelection(user);
          this.openEditor();
        },
        complete: () => this.selectionConfirmationOpen.set(false),
      });
  }

  onSearch(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.search.set(input.value);
    this.resetPage();
  }

  setRoleFilter(role: string): void {
    this.roleFilter.set(role);
    this.resetPage();
  }

  setActiveFilter(active: 'all' | 'active' | 'inactive'): void {
    this.activeFilter.set(active);
    this.resetPage();
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.activeFilter.set('all');
    this.resetPage();
  }

  updatePage(event: PageEvent): void {
    this.pagination.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  overrideFor(key: PermissionKey): UserAuthorizationOverrideValue {
    const value = this.selected()?.permissionOverrides?.[key];
    return value === undefined ? 'inherit' : value ? 'allow' : 'deny';
  }

  setOverride(
    key: PermissionKey,
    value: UserAuthorizationOverrideValue,
  ): void {
    const user = this.selected();
    if (!user || !this.canManage() || (user.protectedOwner && value === 'deny')) return;

    const overrides = { ...(user.permissionOverrides ?? {}) };
    if (value === 'inherit') delete overrides[key];
    else overrides[key] = value === 'allow';
    this.selected.set({ ...user, permissionOverrides: overrides });
  }

  effective(key: PermissionKey): boolean {
    const user = this.selected();
    if (!user) return false;
    return user.effectivePermissions?.[key] === true;
  }

  discard(): void {
    if (this.saving()) return;
    const original = this.original();
    const user = this.selected();
    if (!original || !user) return;

    this.selected.set({
      ...user,
      roleId: original.roleId,
      active: original.active,
      permissionOverrides: { ...original.permissionOverrides },
    });
    this.form.setValue({ roleId: original.roleId, active: original.active });
    this.form.markAsPristine();
  }

  async save(): Promise<boolean> {
    if (
      !this.dirty() ||
      this.form.invalid ||
      this.saving() ||
      this.saveConfirmationOpen() ||
      !this.canManage()
    ) {
      return false;
    }

    const user = this.selected();
    const original = this.original();
    if (!user || !original) return false;
    const command = this.command(user);

    this.saveConfirmationOpen.set(true);
    let confirmed: boolean | undefined;
    try {
      confirmed = await this.dialog
        .open(UserAuthorizationConfirmDialogComponent, {
          data: { user, original, command },
          disableClose: false,
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed()
        .toPromise();
    } finally {
      this.saveConfirmationOpen.set(false);
    }
    if (!confirmed || this.saving()) return false;

    this.saving.set(true);
    try {
      const saved = await this.admin.updateUserAuthorization(command);
      this.applySelection(saved);
      this.snack.open('Los permisos del usuario se actualizaron correctamente.', 'OK', {
        duration: 2500,
      });
      return true;
    } catch {
      this.snack.open('No se pudieron guardar los cambios. Inténtalo nuevamente.', 'OK');
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  private openEditor(): void {
    if (this.editorDialogRef || !this.selected()) return;

    const data: UserAuthorizationEditDialogData = {
      user: this.selected,
      form: this.form,
      permissions: this.permissions,
      dirty: this.dirty,
      saving: this.saving,
      canManage: this.canManage,
      overrideFor: (key) => this.overrideFor(key),
      setOverride: (key, value) => this.setOverride(key, value),
      effective: (key) => this.effective(key),
      discard: () => this.discard(),
      save: () => this.save(),
    };
    const user = this.selected();
    if (!user) return;

    const dialogRef = this.dialog.open(UserAuthorizationEditDialogComponent, {
      width: 'min(960px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '92vh',
      data,
      disableClose: true,
      closeOnNavigation: true,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ariaLabel: `Editar autorización de ${user.displayName}`,
    });
    this.editorDialogRef = dialogRef;
    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.editorDialogRef === dialogRef) {
          this.editorDialogRef = null;
        }
      });
  }

  private applySelection(user: UserProfile): void {
    const selectedUser = {
      ...user,
      permissionOverrides: { ...(user.permissionOverrides ?? {}) },
    };
    const command = this.toCommand(selectedUser);
    this.selected.set(selectedUser);
    this.form.setValue({ roleId: command.roleId, active: command.active });
    this.form.markAsPristine();
    this.original.set(command);
    this.syncFormAccess(selectedUser);
  }

  private command(
    user: UserProfile,
    raw: Partial<{ roleId: string; active: boolean }> = this.form.getRawValue(),
  ): UpdateUserAuthorizationCommand {
    return this.normalizeCommand({
      uid: user.uid,
      roleId: raw.roleId ?? 'seller',
      active: raw.active ?? true,
      permissionOverrides: user.permissionOverrides ?? {},
    });
  }

  private toCommand(user: UserProfile): UpdateUserAuthorizationCommand {
    return this.normalizeCommand({
      uid: user.uid,
      roleId: user.roleId ?? user.role ?? 'seller',
      active: user.active,
      permissionOverrides: user.permissionOverrides ?? {},
    });
  }

  private normalizeCommand(
    command: UpdateUserAuthorizationCommand,
  ): UpdateUserAuthorizationCommand {
    const permissionOverrides = Object.fromEntries(
      PERMISSION_KEYS.flatMap((key) => {
        const value = command.permissionOverrides[key];
        return typeof value === 'boolean' ? [[key, value] as const] : [];
      }),
    ) as Partial<Record<PermissionKey, boolean>>;

    return {
      uid: command.uid,
      roleId: command.roleId.trim() || 'seller',
      active: command.active === true,
      permissionOverrides,
    };
  }

  private resetPage(): void {
    this.pagination.update((current) => ({ ...current, pageIndex: 0 }));
  }

  private syncFormAccess(user: UserProfile | null): void {
    const shouldDisable =
      !user || !this.canManage() || user.protectedOwner === true;

    for (const control of [
      this.form.controls.roleId,
      this.form.controls.active,
    ]) {
      if (shouldDisable && control.enabled) {
        control.disable({ emitEvent: false });
      } else if (!shouldDisable && control.disabled) {
        control.enable({ emitEvent: false });
      }
    }
  }
}

interface ConfirmationData {
  user: UserProfile;
  original: UpdateUserAuthorizationCommand;
  command: UpdateUserAuthorizationCommand;
}

@Component({
  selector: 'app-user-authorization-confirm',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `<h2 mat-dialog-title>Confirmar cambios</h2>
    <mat-dialog-content>
      <strong>{{ data.user.displayName }}</strong>
      <p>{{ data.user.email }}</p>
      @if (data.original.roleId !== data.command.roleId) {
        <p>Rol: {{ data.original.roleId }} → {{ data.command.roleId }}</p>
      }
      @if (data.original.active !== data.command.active) {
        <p>
          Estado: {{ data.original.active ? 'Activo' : 'Inactivo' }} →
          {{ data.command.active ? 'Activo' : 'Inactivo' }}
        </p>
      }
      <p>Overrides: {{ overrideSummary }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="true">Confirmar y guardar</button>
    </mat-dialog-actions>`,
})
export class UserAuthorizationConfirmDialogComponent {
  readonly data = inject<ConfirmationData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<UserAuthorizationConfirmDialogComponent>);

  get overrideSummary(): string {
    return Object.keys(this.data.command.permissionOverrides).length
      ? 'Se aplicará el estado final de permisos.'
      : 'Todos los permisos heredarán del rol.';
  }
}
