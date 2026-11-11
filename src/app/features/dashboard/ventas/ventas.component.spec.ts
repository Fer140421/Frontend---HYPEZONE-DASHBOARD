import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { Venta } from '../../../core/models/venta.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { FidelidadConfigRepository } from '../../../core/repositories/fidelidad-config.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { AuthService } from '../../../core/services/auth.service';
import { CajaService } from '../../../core/services/caja.service';
import { VentaService } from '../../../core/services/venta.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { VentasComponent } from './ventas.component';

describe('VentasComponent entregas pendientes', () => {
  const ventas: Venta[] = [
    { id: 'v1', operacionId: 'op1', productoId: 'p1', nombreProducto: 'Prenda A',
      precioCompra: 10, precioVenta: 20, ganancia: 10, fechaVenta: '2026-11-10',
      clienteNombre: 'Ana', clienteTelefono: '70012345', estadoEntrega: 'pendiente' },
    { id: 'v2', operacionId: 'op1', productoId: 'p2', nombreProducto: 'Prenda B',
      precioCompra: 10, precioVenta: 20, ganancia: 10, fechaVenta: '2026-11-10',
      clienteNombre: 'Ana', clienteTelefono: '70012345', estadoEntrega: 'pendiente' },
    { id: 'v3', operacionId: 'op2', productoId: 'p3', nombreProducto: 'Prenda C',
      precioCompra: 10, precioVenta: 20, ganancia: 10, fechaVenta: '2026-11-11',
      clienteNombre: 'Ana', clienteTelefono: '70012345', estadoEntrega: 'pendiente' },
    { id: 'v4', operacionId: 'op3', productoId: 'p4', nombreProducto: 'Prenda D',
      precioCompra: 10, precioVenta: 20, ganancia: 10, fechaVenta: '2026-11-09',
      clienteNombre: 'Luis', estadoEntrega: 'entregado' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: VentaRepository, useValue: { getAll: () => of(ventas) } },
        { provide: ProductoRepository, useValue: { getAll: () => of([]) } },
        { provide: ClienteRepository, useValue: { getAll: () => of([]) } },
        { provide: FidelidadConfigRepository, useValue: {} },
        { provide: VentaService, useValue: {} },
        { provide: CajaService, useValue: { miCajaAbierta: signal(null), miCajaAbierta$: of(null) } },
        { provide: AuthService, useValue: {} },
        { provide: ViewPreferenceService, useValue: { getViewSignal: () => signal('table') } },
        { provide: ActivatedRoute, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    });
  });

  it('agrupa prendas por compra y permite buscar las compras pendientes por celular', async () => {
    const component = TestBed.runInInjectionContext(() => new VentasComponent());
    const pedidos = await firstValueFrom(component.entregasPendientes$);
    expect(pedidos.map((pedido) => pedido.id)).toEqual(['op2', 'op1']);
    expect(pedidos.find((pedido) => pedido.id === 'op1')?.detalles.length).toBe(2);

    component.entregaBuscando.setValue('70012345');
    expect((await firstValueFrom(component.entregasPendientes$)).length).toBe(2);
    component.entregaBuscando.setValue('Luis');
    expect((await firstValueFrom(component.entregasPendientes$)).length).toBe(0);
  });

  it('abre una caja de Bs 0 para la venta rápida cuando no existe una', async () => {
    const cajas = new BehaviorSubject<{ id: string } | null>(null);
    const caja = TestBed.inject(CajaService) as unknown as {
      miCajaAbierta$: typeof cajas;
      abrirCaja: jasmine.Spy;
    };
    caja.miCajaAbierta$ = cajas;
    caja.abrirCaja = jasmine.createSpy('abrirCaja').and.callFake(async () => {
      cajas.next({ id: 'caja-rapida' });
      return 'caja-rapida';
    });
    const auth = TestBed.inject(AuthService) as unknown as { can: () => boolean };
    auth.can = () => true;
    const router = TestBed.inject(Router) as unknown as { navigate: jasmine.Spy };
    router.navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    const snack = TestBed.inject(MatSnackBar) as unknown as { open: jasmine.Spy };
    snack.open = jasmine.createSpy('open');

    const component = TestBed.runInInjectionContext(() => new VentasComponent());
    await component.iniciarVentaRapida();

    expect(caja.abrirCaja).toHaveBeenCalledWith(0, 'Apertura rápida');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard/ventas/nueva'], {
      queryParams: { rapida: 1 },
    });
    expect(component.procesandoVenta()).toBeFalse();
  });
});
