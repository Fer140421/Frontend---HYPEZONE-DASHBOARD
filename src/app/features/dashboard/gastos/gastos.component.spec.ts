import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, of } from 'rxjs';
import { Gasto } from '../../../core/models/gasto.model';
import { AuthService } from '../../../core/services/auth.service';
import { GastoService } from '../../../core/services/gasto.service';
import { GastosComponent } from './gastos.component';

describe('GastosComponent estados de descuento', () => {
  const gastos: Gasto[] = [
    {
      concepto: 'Pendiente', monto: 30, categoria: 'otro', metodoPago: 'qr', descontado: false,
      fecha: '2026-11-01', usuarioId: 'u1', usuarioNombre: 'Ana',
    },
    {
      concepto: 'Descontado', monto: 20, categoria: 'otro', metodoPago: 'qr', descontado: true,
      fuenteDescuento: 'ganancia', fecha: '2026-11-02', usuarioId: 'u1', usuarioNombre: 'Ana',
    },
    {
      concepto: 'Antiguo', monto: 40, categoria: 'otro', metodoPago: 'qr',
      fecha: '2026-11-03', usuarioId: 'u1', usuarioNombre: 'Ana',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GastoService, useValue: { gastos$: of(gastos), calcularResumen: () => ({ total: 90 }) } },
        { provide: AuthService, useValue: {} },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    });
  });

  it('separa gastos no descontados, descontados y antiguos sin perder sus importes', async () => {
    const component = TestBed.runInInjectionContext(() => new GastosComponent());
    const resumen = await firstValueFrom(component.resumenEstados$);
    const kpis = await firstValueFrom(component.kpis$);

    expect(kpis).toEqual({ total: 90, totalDescontado: 20, cantidad: 3 });
    expect(resumen.sinDescontar).toBe(2);
    expect(resumen.descontados).toBe(1);
    expect(resumen.todos).toBe(3);
    expect((await firstValueFrom(component.pagedGastos$)).items.map((g) => g.concepto)).toEqual([
      'Pendiente', 'Antiguo',
    ]);

    component.updatePage({ pageIndex: 1, pageSize: 1, length: 2 });
    component.seleccionarEstado('descontados');
    const descontados = await firstValueFrom(component.pagedGastos$);
    expect(descontados.pageIndex).toBe(0);
    expect(descontados.items.map((g) => g.concepto)).toEqual(['Descontado']);

    component.seleccionarEstado('todos');
    expect((await firstValueFrom(component.pagedGastos$)).total).toBe(3);
  });
});
