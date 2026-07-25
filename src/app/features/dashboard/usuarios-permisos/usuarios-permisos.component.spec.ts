import { provideZonelessChangeDetection } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  Observable,
  Subject,
  finalize,
  firstValueFrom,
  of,
  tap,
  throwError,
} from 'rxjs';
import { UserProfile } from '../../../core/models/user-profile.model';
import { AuthService } from '../../../core/services/auth.service';
import { UserAuthorizationAdminService } from '../../../core/services/user-authorization-admin.service';
import { UserAuthorizationAdminTestDouble } from '../../../core/testing/user-authorization-admin.test-double';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  UserAuthorizationConfirmDialogComponent,
  UsuariosPermisosComponent,
} from './usuarios-permisos.component';
import { UserAuthorizationEditDialogComponent } from './user-authorization-edit-dialog.component';

describe('UsuariosPermisosComponent local editing flow', () => {
  let fixture: ComponentFixture<UsuariosPermisosComponent>;
  let component: UsuariosPermisosComponent;
  let admin: UserAuthorizationAdminService;
  let loadSpy: jasmine.Spy;
  let updateSpy: jasmine.Spy;
  let dialog: { open: jasmine.Spy };
  let snack: { open: jasmine.Spy };

  const auth = {
    can: jasmine.createSpy('can'),
  };

  beforeEach(async () => {
    auth.can.and.callFake(
      (permission: string) => permission === 'permissions.managePermissions',
    );
    dialog = { open: jasmine.createSpy('open') };
    dialog.open.and.returnValue({ afterClosed: () => of(false) });
    snack = { open: jasmine.createSpy('open') };

    const testBed = TestBed.configureTestingModule({
      imports: [UsuariosPermisosComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: auth },
        { provide: UserAuthorizationAdminService, useClass: UserAuthorizationAdminTestDouble },
      ],
    });
    testBed.overrideProvider(MatDialog, { useValue: dialog });
    testBed.overrideProvider(MatSnackBar, { useValue: snack });
    await testBed.compileComponents();

    fixture = TestBed.createComponent(UsuariosPermisosComponent);
    component = fixture.componentInstance;
    admin = TestBed.inject(UserAuthorizationAdminService);
    loadSpy = spyOn(admin, 'loadUsers').and.returnValue(of(admin.users()));
    updateSpy = spyOn(admin, 'updateUserAuthorization').and.callThrough();
  });

  it('keeps dirty false without a selected user or original command', () => {
    expect(component.selected()).toBeNull();
    expect(component.original()).toBeNull();
    expect(component.dirty()).toBeFalse();
  });

  it('shows the initial loading spinner and hides the table until data arrives', () => {
    const response = new Subject<UserProfile[]>();
    loadSpy.and.callFake(() => controlledLoad(response));

    fixture.detectChanges();
    fixture.detectChanges();

    expect(admin.loading()).toBeTrue();
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();

    response.next(admin.users());
    response.complete();
    fixture.detectChanges();

    expect(admin.loading()).toBeFalse();
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('tr.mat-mdc-row').length).toBe(4);
  });

  it('renders the unfiltered empty message and omits the paginator', () => {
    loadSpy.and.callFake(() => {
      admin.users.set([]);
      admin.error.set(null);
      return of([]);
    });

    renderLoadedTable();

    expect(fixture.nativeElement.textContent).toContain('No hay usuarios registrados.');
    expect(fixture.nativeElement.querySelector('mat-paginator')).toBeNull();
  });

  it('renders a controlled load error and retry action', () => {
    loadSpy.and.callFake(() => controlledLoadFailure('Fallo local de carga.'));

    renderLoadedTable();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Fallo local de carga.');
    expect(alert.textContent).toContain('Reintentar');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('clears a previous error during retry and renders rows after success', () => {
    const retryResponse = new Subject<UserProfile[]>();
    loadSpy.and.callFake(() => controlledLoadFailure('Fallo inicial.'));
    renderLoadedTable();

    loadSpy.and.callFake(() => controlledLoad(retryResponse));
    const retryButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Reintentar'));
    retryButton?.click();
    fixture.detectChanges();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(admin.error()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-progress-spinner')).not.toBeNull();

    retryResponse.next(admin.users());
    retryResponse.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('table')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('tr.mat-mdc-row').length).toBe(4);
  });

  it('filters by trimmed case-insensitive display name and email', () => {
    component.search.set('  aNa OwNeR  ');
    expect(component.users().map((record) => record.uid)).toEqual(['local-owner']);

    component.search.set('BRUNO.ADMIN@LOCAL.TEST');
    expect(component.users().map((record) => record.uid)).toEqual(['local-admin']);
  });

  it('filters by role, active state and combined criteria', () => {
    component.setRoleFilter('seller');
    expect(component.users().map((record) => record.uid)).toEqual([
      'local-seller',
      'local-inactive',
    ]);

    component.setActiveFilter('inactive');
    expect(component.users().map((record) => record.uid)).toEqual(['local-inactive']);

    component.search.set('Carla');
    expect(component.users()).toEqual([]);

    component.search.set('');
    component.setActiveFilter('active');
    expect(component.users().map((record) => record.uid)).toEqual(['local-seller']);
  });

  it('clears every filter, resets pagination and does not mutate source users', () => {
    const before = structuredClone(admin.users());
    component.updatePage({ pageIndex: 1, pageSize: 2, length: 4 });
    component.search.set('Carla');
    component.setRoleFilter('seller');
    component.setActiveFilter('active');

    component.clearFilters();

    expect(component.search()).toBe('');
    expect(component.roleFilter()).toBe('');
    expect(component.activeFilter()).toBe('all');
    expect(component.paginatedUsers().pageIndex).toBe(0);
    expect(component.users()).toEqual(before);
    expect(admin.users()).toEqual(before);
  });

  it('compares overrides in catalog order and ignores undefined values', () => {
    component.select({
      ...user('local-admin'),
      permissionOverrides: {
        'sales.create': false,
        'clients.create': undefined,
        'products.delete': true,
      },
    });
    const selected = component.selected();
    if (!selected) throw new Error('Expected a selected local user.');

    component.selected.set({
      ...selected,
      permissionOverrides: { 'products.delete': true, 'sales.create': false },
    });

    expect(component.original()?.permissionOverrides).toEqual({
      'products.delete': true,
      'sales.create': false,
    });
    expect(component.dirty()).toBeFalse();
  });

  it('selects a user when the edit pencil is clicked', () => {
    renderLoadedTable();

    editButtons()[0].click();

    expect(component.selected()?.uid).toBe('local-owner');
    expect(component.dirty()).toBeFalse();
  });

  it('opens the responsive Material editor dialog after selecting a user', () => {
    renderLoadedTable();

    editButtons()[1].click();

    const editorCalls = dialogCalls(UserAuthorizationEditDialogComponent);
    expect(editorCalls.length).toBe(1);
    const config = editorCalls[0][1] as {
      width: string;
      maxWidth: string;
      maxHeight: string;
      disableClose: boolean;
      restoreFocus: boolean;
      ariaLabel: string;
      data: { user: () => UserProfile | null };
    };
    expect(config.width).toBe('min(960px, 96vw)');
    expect(config.maxWidth).toBe('96vw');
    expect(config.maxHeight).toBe('92vh');
    expect(config.disableClose).toBeTrue();
    expect(config.restoreFocus).toBeTrue();
    expect(config.ariaLabel).toBe('Editar autorización de Bruno Admin');
    expect(config.data.user()?.uid).toBe('local-admin');
  });

  it('uses the full-width list layout while no user is selected', () => {
    renderLoadedTable();

    const layout = fixture.nativeElement.querySelector('.users-layout') as HTMLElement;
    expect(layout.classList.contains('has-selection')).toBeFalse();
    expect(fixture.nativeElement.querySelector('.editor-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-paginator')).not.toBeNull();
  });

  it('keeps the full-width list and marks the selected row while the dialog is open', () => {
    renderLoadedTable();

    editButtons()[1].click();
    fixture.detectChanges();

    const layout = fixture.nativeElement.querySelector('.users-layout') as HTMLElement;
    const selectedRow = fixture.nativeElement.querySelector(
      'tr[aria-selected="true"]',
    ) as HTMLTableRowElement | null;
    expect(layout.classList.contains('has-selection')).toBeFalse();
    expect(fixture.nativeElement.querySelector('.editor-card')).toBeNull();
    expect(selectedRow?.textContent).toContain('Bruno Admin');
    expect(dialogCalls(UserAuthorizationEditDialogComponent).length).toBe(1);
  });

  it('provides a user-specific accessible label for every edit pencil', () => {
    renderLoadedTable();

    expect(editButtons()[0].getAttribute('aria-label')).toBe(
      'Editar permisos de Ana Owner',
    );
  });

  it('paginates filtered users and resets to the first page when a filter changes', () => {
    const localUsers: UserProfile[] = Array.from({ length: 12 }, (_, index) => ({
      uid: `page-user-${index}`,
      displayName: `Usuario ${index}`,
      email: `usuario${index}@local.test`,
      roleId: index === 11 ? 'admin' : 'seller',
      active: true,
      permissionOverrides: {},
    }));
    admin.users.set(localUsers);

    component.updatePage({ pageIndex: 1, pageSize: 10, length: 12 });
    expect(component.paginatedUsers().pageIndex).toBe(1);
    expect(component.paginatedUsers().items.length).toBe(2);

    component.setRoleFilter('admin');

    expect(component.paginatedUsers().pageIndex).toBe(0);
    expect(component.paginatedUsers().total).toBe(1);
    expect(component.paginatedUsers().items[0].uid).toBe('page-user-11');
  });

  it('uses the shared initial page size and changes page and pageSize', () => {
    const localUsers: UserProfile[] = Array.from({ length: 30 }, (_, index) => ({
      uid: `pagination-user-${index}`,
      displayName: `Usuario ${index}`,
      email: `pagination${index}@local.test`,
      roleId: 'seller',
      active: true,
      permissionOverrides: {},
    }));
    admin.users.set(localUsers);

    expect(component.paginatedUsers().pageSize).toBe(10);
    expect(component.paginatedUsers().items[0].uid).toBe('pagination-user-0');

    component.updatePage({ pageIndex: 1, pageSize: 10, length: 30 });
    expect(component.paginatedUsers().items[0].uid).toBe('pagination-user-10');

    component.updatePage({ pageIndex: 0, pageSize: 25, length: 30 });
    expect(component.paginatedUsers().pageSize).toBe(25);
    expect(component.paginatedUsers().items.length).toBe(25);
  });

  it('binds paginator length and page state to filtered results', () => {
    renderLoadedTable();
    component.setRoleFilter('seller');
    fixture.detectChanges();

    const paginator = fixture.debugElement.query(By.directive(MatPaginator))
      .componentInstance as MatPaginator;
    expect(paginator.length).toBe(2);
    expect(paginator.pageIndex).toBe(0);
    expect(paginator.pageSize).toBe(10);
  });

  it('loads role and active values from the selected user into the form', () => {
    component.select(user('local-inactive'));

    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: false });
    expect(component.original()?.uid).toBe('local-inactive');
    expect(component.dirty()).toBeFalse();
  });

  it('enables editable form controls for managers and disables them for owner', () => {
    component.select(user('local-admin'));
    expect(component.form.controls.roleId.enabled).toBeTrue();
    expect(component.form.controls.active.enabled).toBeTrue();

    component.select(user('local-owner'));
    fixture.detectChanges();

    expect(component.form.controls.roleId.disabled).toBeTrue();
    expect(component.form.controls.active.disabled).toBeTrue();
  });

  it('removes an override when choosing inherit', () => {
    component.select(user('local-admin'));
    expect(component.overrideFor('products.delete')).toBe('allow');

    component.setOverride('products.delete', 'inherit');

    expect(
      component.selected()?.permissionOverrides?.['products.delete'],
    ).toBeUndefined();
    expect(component.overrideFor('products.delete')).toBe('inherit');
  });

  it('stores allow as true and deny as false', () => {
    component.select(user('local-seller'));

    component.setOverride('products.delete', 'allow');
    component.setOverride('sales.create', 'deny');

    expect(component.selected()?.permissionOverrides?.['products.delete']).toBeTrue();
    expect(component.selected()?.permissionOverrides?.['sales.create']).toBeFalse();
  });

  it('displays server-materialized effective permissions without recalculating them locally', () => {
    component.select(user('local-seller'));
    expect(component.effective('products.delete')).toBeFalse();
    expect(component.effective('sales.create')).toBeTrue();

    component.setOverride('products.delete', 'allow');
    component.setOverride('sales.create', 'deny');
    expect(component.effective('products.delete')).toBeFalse();
    expect(component.effective('sales.create')).toBeTrue();

    component.form.controls.roleId.setValue('admin');
    expect(component.effective('products.create')).toBeFalse();
    component.setOverride('products.create', 'deny');
    expect(component.effective('products.create')).toBeFalse();
  });

  it('does not persist undefined overrides in the save command', async () => {
    component.select({
      ...user('local-admin'),
      permissionOverrides: {
        'products.delete': true,
        'clients.create': undefined,
      },
    });
    component.form.controls.active.setValue(false);
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    await component.save();

    expect(updateSpy).toHaveBeenCalledWith({
      uid: 'local-admin',
      roleId: 'admin',
      active: false,
      permissionOverrides: { 'products.delete': true },
    });
  });

  it('switches users immediately when there are no pending changes', () => {
    component.select(user('local-admin'));

    component.select(user('local-seller'));

    expect(component.selected()?.uid).toBe('local-seller');
    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: true });
    expect(dialogCalls(ConfirmDialogComponent).length).toBe(0);
    expect(component.dirty()).toBeFalse();
  });

  it('opens the shared confirmation dialog when switching with pending changes', () => {
    component.select(user('local-admin'));
    component.form.controls.roleId.setValue('seller');
    expect(component.dirty()).toBeTrue();

    component.select(user('local-seller'));

    const confirmationCalls = dialogCalls(ConfirmDialogComponent);
    expect(confirmationCalls.length).toBe(1);
    const config = confirmationCalls[0][1] as {
      data: { title: string; confirmText: string };
    };
    expect(config.data.title).toBe('Cambios sin guardar');
    expect(config.data.confirmText).toBe('Descartar y continuar');
  });

  it('keeps the current user and form when switching is cancelled', () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    dialog.open.and.returnValue({ afterClosed: () => of(false) });

    component.select(user('local-seller'));

    expect(component.selected()?.uid).toBe('local-admin');
    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: false });
    expect(component.dirty()).toBeTrue();
  });

  it('discards pending changes and selects the requested user after confirmation', () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    component.select(user('local-seller'));

    expect(component.selected()?.uid).toBe('local-seller');
    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: true });
    expect(component.original()?.uid).toBe('local-seller');
    expect(component.dirty()).toBeFalse();
  });

  it('saves the normalized command once in the local adapter', async () => {
    component.select(user('local-admin'));
    component.form.controls.roleId.setValue('seller');
    component.setOverride('products.delete', 'deny');
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    await component.save();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({
      uid: 'local-admin',
      roleId: 'seller',
      active: true,
      permissionOverrides: { 'products.delete': false },
    });
    expect(user('local-admin').roleId).toBe('seller');
    expect(user('local-admin').permissionOverrides?.['products.delete']).toBeFalse();
    expect(snack.open).toHaveBeenCalledWith(
      'Los permisos del usuario se actualizaron correctamente.',
      'OK',
      { duration: 2500 },
    );
  });

  it('synchronizes selected, original and form so dirty is false after saving', async () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    await component.save();

    expect(component.selected()?.roleId).toBe('seller');
    expect(component.selected()?.active).toBeFalse();
    expect(component.original()?.roleId).toBe('seller');
    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: false });
    expect(component.dirty()).toBeFalse();
  });

  it('preserves the edited form and local record when save fails', async () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    component.setOverride('products.delete', 'deny');
    updateSpy.and.rejectWith(new Error('Fallo local controlado.'));
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    await component.save();

    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: false });
    expect(component.selected()?.permissionOverrides?.['products.delete']).toBeFalse();
    expect(component.dirty()).toBeTrue();
    expect(user('local-admin').roleId).toBe('admin');
    expect(user('local-admin').active).toBeTrue();
    expect(snack.open).toHaveBeenCalledWith(
      'No se pudieron guardar los cambios. Inténtalo nuevamente.',
      'OK',
    );
  });

  it('restores role, active and permission overrides when changes are discarded', () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    component.setOverride('products.delete', 'deny');
    expect(component.dirty()).toBeTrue();

    component.discard();

    expect(component.selected()?.roleId).toBe('admin');
    expect(component.selected()?.active).toBeTrue();
    expect(component.selected()?.permissionOverrides).toEqual({ 'products.delete': true });
    expect(component.form.getRawValue()).toEqual({ roleId: 'admin', active: true });
    expect(component.dirty()).toBeFalse();
  });

  it('does not call the local service when changes are discarded', () => {
    component.select(user('local-admin'));
    component.form.controls.active.setValue(false);

    component.discard();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('keeps protected-owner restrictions in the UI and local service', async () => {
    component.select(user('local-owner'));
    component.setOverride('dashboard.view', 'deny');
    expect(component.selected()?.permissionOverrides?.['dashboard.view']).toBeUndefined();
    component.form.setValue({ roleId: 'admin', active: false });
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    await component.save();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(user('local-owner').roleId).toBe('owner');
    expect(user('local-owner').active).toBeTrue();
    expect(component.form.getRawValue()).toEqual({ roleId: 'admin', active: false });
    expect(component.dirty()).toBeTrue();
    expect(snack.open).toHaveBeenCalledWith(
      'No se pudieron guardar los cambios. Inténtalo nuevamente.',
      'OK',
    );
  });

  it('does not open duplicate confirmations or call save twice', async () => {
    const closed = new Subject<boolean>();
    dialog.open.and.returnValue({ afterClosed: () => closed.asObservable() });
    component.select(user('local-admin'));
    component.form.controls.roleId.setValue('seller');

    const firstSave = component.save();
    const secondSave = component.save();
    expect(dialogCalls(UserAuthorizationConfirmDialogComponent).length).toBe(1);

    closed.next(true);
    closed.complete();
    await Promise.all([firstSave, secondSave]);

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('allows navigation immediately without opening a dialog when clean', () => {
    component.select(user('local-admin'));

    expect(component.confirmNavigationAway()).toBeTrue();
    expect(dialogCalls(ConfirmDialogComponent).length).toBe(0);
  });

  it('keeps selection and form when the user chooses Permanecer', async () => {
    component.select(user('local-admin'));
    component.form.setValue({ roleId: 'seller', active: false });
    dialog.open.and.returnValue({ afterClosed: () => of(false) });

    const allowed = await resolveNavigation(component.confirmNavigationAway());

    expect(allowed).toBeFalse();
    expect(component.selected()?.uid).toBe('local-admin');
    expect(component.form.getRawValue()).toEqual({ roleId: 'seller', active: false });
    expect(component.dirty()).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();
    const config = dialog.open.calls.mostRecent().args[1] as {
      data: { cancelText: string; confirmText: string };
      autoFocus: string;
      restoreFocus: boolean;
    };
    expect(config.data.cancelText).toBe('Permanecer');
    expect(config.data.confirmText).toBe('Descartar y salir');
    expect(config.autoFocus).toBe('first-tabbable');
    expect(config.restoreFocus).toBeTrue();
  });

  it('allows leaving without saving when changes are discarded on exit', async () => {
    component.select(user('local-admin'));
    component.form.controls.active.setValue(false);
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    const allowed = await resolveNavigation(component.confirmNavigationAway());

    expect(allowed).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(user('local-admin').active).toBeTrue();
  });

  it('shares one exit confirmation across repeated navigation attempts', async () => {
    const closed = new Subject<boolean>();
    component.select(user('local-admin'));
    component.form.controls.active.setValue(false);
    dialog.open.and.returnValue({ afterClosed: () => closed.asObservable() });

    const first = component.confirmNavigationAway();
    const second = component.confirmNavigationAway();
    expect(first).toBe(second);
    expect(dialogCalls(ConfirmDialogComponent).length).toBe(1);

    const resultsPromise = Promise.all([
      resolveNavigation(first),
      resolveNavigation(second),
    ]);
    closed.next(false);
    closed.complete();

    expect(await resultsPromise).toEqual([false, false]);
  });

  it('keeps the edit action keyboard-focusable and opens the accessible dialog', () => {
    renderLoadedTable();
    const editButton = editButtons()[1];

    expect(editButton.tagName).toBe('BUTTON');
    expect(editButton.tabIndex).toBeGreaterThanOrEqual(0);
    expect(editButton.getAttribute('aria-label')).toBe(
      'Editar permisos de Bruno Admin',
    );
    editButton.focus();
    expect(document.activeElement).toBe(editButton);
    editButton.click();

    const config = dialogCalls(UserAuthorizationEditDialogComponent)[0][1] as {
      autoFocus: string;
      restoreFocus: boolean;
      ariaLabel: string;
    };
    expect(config.autoFocus).toBe('first-tabbable');
    expect(config.restoreFocus).toBeTrue();
    expect(config.ariaLabel).toBe('Editar autorización de Bruno Admin');
  });

  function renderLoadedTable(): void {
    fixture.detectChanges();
    fixture.detectChanges();
  }

  function editButtons(): HTMLButtonElement[] {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    );
    return buttons.filter((button) => button.textContent?.trim() === 'edit');
  }

  function dialogCalls(dialogComponent: unknown): unknown[][] {
    return dialog.open.calls
      .all()
      .filter((call) => call.args[0] === dialogComponent)
      .map((call) => call.args);
  }

  function user(uid: string): UserProfile {
    const found = admin.users().find((item) => item.uid === uid);
    if (!found) throw new Error(`Missing local test user: ${uid}`);
    return found;
  }

  function controlledLoad(
    source: Observable<UserProfile[]>,
  ): Observable<UserProfile[]> {
    admin.loading.set(true);
    admin.error.set(null);
    return source.pipe(
      tap((records) => admin.users.set(structuredClone(records))),
      finalize(() => admin.loading.set(false)),
    );
  }

  function controlledLoadFailure(message: string): Observable<UserProfile[]> {
    admin.loading.set(true);
    admin.error.set(null);
    return throwError(() => new Error(message)).pipe(
      tap({
        error: (error: Error) => admin.error.set(error.message),
      }),
      finalize(() => admin.loading.set(false)),
    );
  }

  async function resolveNavigation(
    result: boolean | Observable<boolean>,
  ): Promise<boolean> {
    return typeof result === 'boolean' ? result : firstValueFrom(result);
  }
});
