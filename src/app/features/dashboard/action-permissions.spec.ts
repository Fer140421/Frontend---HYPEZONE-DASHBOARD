import { CatalogosComponent } from './catalogos/catalogos.component';
import { ClientesComponent } from './clientes/clientes.component';
import { LotesComponent } from './lotes/lotes.component';
import { ProveedoresComponent } from './proveedores/proveedores.component';
import { VentasComponent } from './ventas/ventas.component';

/**
 * These focused tests exercise the permission boundary in component methods.
 * Templates hide controls for UX; the method checks are kept as a second
 * frontend boundary so a stale click or direct invocation cannot start work.
 */
describe('Dashboard action permission gates', () => {
  const denies = { can: () => false, canAny: () => false };

  it('does not open client create or edit dialogs without their permissions', () => {
    const component = Object.create(ClientesComponent.prototype) as any;
    component.auth = denies;
    component.dialog = { open: jasmine.createSpy('open') };

    component.openCreate();
    component.openEdit({ id: 'client-1' });

    expect(component.dialog.open).not.toHaveBeenCalled();
  });

  it('does not open provider create or edit dialogs without their permissions', () => {
    const component = Object.create(ProveedoresComponent.prototype) as any;
    component.auth = denies;
    component.dialog = { open: jasmine.createSpy('open') };

    component.openCreate();
    component.openEdit({ id: 'provider-1' });

    expect(component.dialog.open).not.toHaveBeenCalled();
  });

  it('does not open catalog create dialogs or delete entries without catalog permissions', async () => {
    const component = Object.create(CatalogosComponent.prototype) as any;
    component.auth = denies;
    component.dialog = { open: jasmine.createSpy('open') };
    component.categorias = { delete: jasmine.createSpy('delete') };

    component.openCreate();
    component.openEdit({ id: 'cat-1' });
    await component.removeCategoria('category-1');

    expect(component.dialog.open).not.toHaveBeenCalled();
    expect(component.categorias.delete).not.toHaveBeenCalled();
  });

  it('does not start a lot save without create or update permission', async () => {
    const component = Object.create(LotesComponent.prototype) as any;
    component.auth = denies;
    component.currentId = () => null;
    component.lotes = { create: jasmine.createSpy('create') };

    await component.save();

    expect(component.lotes.create).not.toHaveBeenCalled();
  });

  it('does not navigate to sale editing without sales.update', () => {
    const component = Object.create(VentasComponent.prototype) as any;
    component.auth = denies;
    component.router = { navigate: jasmine.createSpy('navigate') };

    component.editSale({ id: 'sale-1' });

    expect(component.router.navigate).not.toHaveBeenCalled();
  });

  it('allows sale editing when sales.update is granted', () => {
    const component = Object.create(VentasComponent.prototype) as any;
    component.auth = { can: (permission: string) => permission === 'sales.update' };
    component.router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };

    component.editSale({ id: 'sale-1' });

    expect(component.router.navigate).toHaveBeenCalledWith(['/dashboard/ventas', 'sale-1', 'editar']);
  });
});
