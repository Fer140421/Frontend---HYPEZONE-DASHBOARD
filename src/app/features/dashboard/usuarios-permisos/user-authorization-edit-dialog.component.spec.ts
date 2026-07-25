import {
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { of } from 'rxjs';
import { PERMISSION_CATALOG } from '../../../core/authorization/permission-catalog';
import {
  UserAuthorizationEditDialogComponent,
  UserAuthorizationEditDialogData,
} from './user-authorization-edit-dialog.component';

describe('UserAuthorizationEditDialogComponent', () => {
  let fixture: ComponentFixture<UserAuthorizationEditDialogComponent>;
  const dirty = signal(false);
  const saving = signal(false);
  const canManage = signal(true);
  const discard = jasmine.createSpy('discard');
  const save = jasmine.createSpy('save');
  const dialogRef = {
    close: jasmine.createSpy('close'),
  };
  const dialog = {
    open: jasmine.createSpy('open'),
  };
  const data: UserAuthorizationEditDialogData = {
    user: signal({
      uid: 'local-admin',
      displayName: 'Bruno Admin',
      email: 'bruno.admin@local.test',
      roleId: 'admin',
      active: true,
      permissionOverrides: {},
    }),
    form: new FormGroup({
      roleId: new FormControl('admin', { nonNullable: true }),
      active: new FormControl(true, { nonNullable: true }),
    }),
    permissions: [PERMISSION_CATALOG[0]],
    dirty,
    saving,
    canManage,
    overrideFor: () => 'inherit',
    setOverride: jasmine.createSpy('setOverride'),
    effective: () => true,
    discard,
    save,
  };

  beforeEach(async () => {
    dirty.set(false);
    saving.set(false);
    canManage.set(true);
    discard.calls.reset();
    save.calls.reset();
    save.and.resolveTo(false);
    dialogRef.close.calls.reset();
    dialog.open.calls.reset();
    dialog.open.and.returnValue({ afterClosed: () => of(false) });

    const testBed = TestBed.configureTestingModule({
      imports: [UserAuthorizationEditDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    testBed.overrideProvider(MatDialog, { useValue: dialog });
    await testBed.compileComponents();

    fixture = TestBed.createComponent(UserAuthorizationEditDialogComponent);
    fixture.detectChanges();
  });

  it('renders the Material dialog title, form and effective permissions', () => {
    expect(fixture.nativeElement.textContent).toContain('Bruno Admin');
    expect(fixture.nativeElement.textContent).toContain('bruno.admin@local.test');
    expect(fixture.nativeElement.textContent).toContain('Acceso de la cuenta');
    expect(fixture.nativeElement.textContent).toContain('Overrides de permisos');
    expect(fixture.nativeElement.textContent).toContain('Efectivo: permitir');
    expect(fixture.nativeElement.querySelector('mat-dialog-content')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('mat-dialog-actions')).not.toBeNull();
  });

  it('shows keyboard-focusable discard and save actions only while dirty', () => {
    expect(actionLabels()).toEqual(['Cerrar']);

    dirty.set(true);
    fixture.detectChanges();

    const buttons = actionButtons();
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Cerrar',
      'Descartar cambios',
      'Guardar cambios',
    ]);
    expect(buttons.every((button) => button.tabIndex >= 0)).toBeTrue();
  });

  it('closes immediately without confirmation when the form is clean', () => {
    fixture.componentInstance.requestClose();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledOnceWith();
  });

  it('keeps editing when discard-and-close confirmation is cancelled', () => {
    dirty.set(true);

    fixture.componentInstance.requestClose();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    const config = dialog.open.calls.mostRecent().args[1] as {
      data: { cancelText: string; confirmText: string };
      restoreFocus: boolean;
    };
    expect(config.data.cancelText).toBe('Continuar editando');
    expect(config.data.confirmText).toBe('Descartar y cerrar');
    expect(config.restoreFocus).toBeTrue();
  });

  it('discards and closes after confirmation, and closes after a successful save', async () => {
    dirty.set(true);
    dialog.open.and.returnValue({ afterClosed: () => of(true) });

    fixture.componentInstance.requestClose();

    expect(discard).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);

    dialogRef.close.calls.reset();
    save.and.resolveTo(true);
    await fixture.componentInstance.save();

    expect(save).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledOnceWith(true);
  });

  function actionButtons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(
        'mat-dialog-actions button',
      ) as NodeListOf<HTMLButtonElement>,
    );
  }

  function actionLabels(): string[] {
    return actionButtons().map((button) => button.textContent?.trim() ?? '');
  }
});
