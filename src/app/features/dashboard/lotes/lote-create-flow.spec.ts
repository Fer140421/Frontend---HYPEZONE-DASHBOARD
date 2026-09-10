import { signal } from '@angular/core';
import { of } from 'rxjs';
import { LotesComponent, LoteProductCreateDialogComponent } from './lotes.component';

describe('Lot creation flow', () => {
  let component: any;

  beforeEach(() => {
    component = Object.create(LotesComponent.prototype);
    component.auth = { can: () => true };
    component.currentId = signal(null);
    component.saving = signal(false);
    component.form = {
      invalid: false,
      markAllAsTouched: jasmine.createSpy(),
      getRawValue: () => ({ nombre: 'Lote', descripcion: '', fechaCompra: new Date(), proveedorId: '', lugarCompra: '', costoTotal: 100, notas: '' }),
    };
    component.proveedoresSource$ = of([]);
    component.lotes = { create: jasmine.createSpy().and.resolveTo('lot-1') };
    component.router = { navigate: jasmine.createSpy().and.resolveTo(true) };
    component.message = jasmine.createSpy();
    component.showError = jasmine.createSpy();
    component.dialog = { open: jasmine.createSpy().and.returnValue({ afterClosed: () => of('later') }) };
  });

  it('does not save when the choice is dismissed', async () => {
    component.dialog.open.and.returnValue({ afterClosed: () => of(undefined) });
    await component.save();
    expect(component.lotes.create).not.toHaveBeenCalled();
    expect(component.router.navigate).not.toHaveBeenCalled();
    expect(component.saving()).toBeFalse();
  });

  it('saves only the lot and returns to the list when choosing later', async () => {
    await component.save();
    expect(component.lotes.create).toHaveBeenCalledTimes(1);
    expect(component.router.navigate).toHaveBeenCalledWith(['/dashboard/lotes']);
    expect(component.dialog.open).toHaveBeenCalledTimes(1);
  });

  it('opens product registration with the saved lot ID when choosing now', async () => {
    component.dialog.open.and.returnValue({ afterClosed: () => of('now') });
    await component.save();
    expect(component.lotes.create).toHaveBeenCalledTimes(1);
    expect(component.dialog.open).toHaveBeenCalledWith(LoteProductCreateDialogComponent, jasmine.objectContaining({ data: { loteId: 'lot-1' } }));
  });

  it('keeps the form available after a save failure without opening product registration', async () => {
    component.dialog.open.and.returnValue({ afterClosed: () => of('now') });
    component.lotes.create.and.rejectWith(new Error('Save failed'));
    await component.save();
    expect(component.dialog.open).toHaveBeenCalledTimes(1);
    expect(component.router.navigate).not.toHaveBeenCalled();
    expect(component.showError).toHaveBeenCalled();
    expect(component.saving()).toBeFalse();
  });

  it('ignores repeated submissions while a save is in progress', async () => {
    component.saving.set(true);
    await component.save();
    expect(component.dialog.open).not.toHaveBeenCalled();
    expect(component.lotes.create).not.toHaveBeenCalled();
  });
});
