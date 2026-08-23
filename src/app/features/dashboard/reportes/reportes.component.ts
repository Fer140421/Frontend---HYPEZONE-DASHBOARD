import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, combineLatest, map, of, shareReplay, startWith } from 'rxjs';
import { Cliente } from '../../../core/models/cliente.model';
import { Lote } from '../../../core/models/lote.model';
import { Producto } from '../../../core/models/producto.model';
import { Reserva } from '../../../core/models/reserva.model';
import { Venta } from '../../../core/models/venta.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { LoteRepository } from '../../../core/repositories/lote.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { ReservaRepository } from '../../../core/repositories/reserva.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

interface VentaDetalleReporte {
  venta: Venta;
  producto?: Producto;
}

interface RankingReporte {
  nombre: string;
  cantidad: number;
  ingreso: number;
  ganancia: number;
  detalles: VentaDetalleReporte[];
}

interface ClienteReporte extends RankingReporte {
  cliente?: Cliente;
}

interface ReportesData {
  detalles: VentaDetalleReporte[];
  ventas: Venta[];
  productos: Producto[];
  clientes: Cliente[];
  lotes: Lote[];
  reservas: Reserva[];
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule, PageHeaderComponent],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class ReportesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly ventas = inject(VentaRepository);
  private readonly productos = inject(ProductoRepository);
  private readonly clientes = inject(ClienteRepository);
  private readonly lotes = inject(LoteRepository);
  private readonly reservas = inject(ReservaRepository);
  readonly loadError = signal<string | null>(null);

  readonly filtro = this.fb.nonNullable.group({ desde: [''], hasta: [''] });
  private readonly ventas$ = this.ventas.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly productos$ = this.productos.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly clientes$ = this.clientes.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly lotes$ = this.lotes.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly reservas$ = this.reservas.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly data$ = combineLatest([
    this.ventas$, this.productos$, this.clientes$, this.lotes$, this.reservas$,
    this.filtro.valueChanges.pipe(startWith(this.filtro.getRawValue())),
  ]).pipe(
    map(([ventas, productos, clientes, lotes, reservas, filtro]) => {
      const desde = filtro.desde ? new Date(`${filtro.desde}T00:00:00`).getTime() : 0;
      const hasta = filtro.hasta ? new Date(`${filtro.hasta}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      const ventasRango = ventas.filter((venta) => {
        const fecha = new Date(venta.fechaVenta).getTime();
        return venta.activo !== false && fecha >= desde && fecha <= hasta;
      });
      const productosPorId = new Map(productos.map((producto) => [producto.id, producto]));
      return {
        detalles: ventasRango.map((venta) => ({ venta, producto: productosPorId.get(venta.productoId) })),
        ventas: ventasRango,
        productos,
        clientes,
        lotes,
        reservas: reservas.filter((reserva) => {
          const fecha = new Date(reserva.fechaReserva).getTime();
          return reserva.activo !== false && fecha >= desde && fecha <= hasta;
        }),
      } satisfies ReportesData;
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly viewModel$ = this.data$.pipe(map((data) => {
    const operaciones = new Set(data.ventas.map((venta) => venta.operacionId ?? venta.id)).size;
    const productosMasVendidos = this.rank(data.detalles, (detalle) => detalle.venta.nombreProducto);
    const marcas = this.rank(data.detalles, (detalle) => detalle.producto?.marca || 'Sin marca');
    const categorias = this.rank(data.detalles, (detalle) => detalle.producto?.categoria || 'Sin categoría');
    const lotesPorId = new Map(data.lotes.map((lote) => [lote.id, lote.nombre]));
    const lotes = this.rank(data.detalles, (detalle) => lotesPorId.get(detalle.venta.loteId) || 'Sin lote');
    const clientesPorId = new Map(data.clientes.map((cliente) => [cliente.id, cliente]));
    const clientes = this.rank(data.detalles, (detalle) => detalle.venta.clienteNombre || 'Venta sin cliente')
      .map((item) => ({ ...item, cliente: item.detalles[0]?.venta.clienteId ? clientesPorId.get(item.detalles[0].venta.clienteId) : undefined }))
      .slice(0, 10) as ClienteReporte[];
    const descuento = data.ventas.reduce((total, venta) => total + Number(venta.descuentoAplicado ?? 0), 0);
    const reservasActivas = data.reservas.filter((reserva) => reserva.estado === 'activa');
    const hoy = new Date().setHours(0, 0, 0, 0);
    return {
      ...data,
      metricas: {
        operaciones,
        prendas: data.detalles.length,
        ingreso: data.ventas.reduce((total, venta) => total + Number(venta.precioVenta), 0),
        ganancia: data.ventas.reduce((total, venta) => total + Number(venta.ganancia), 0),
        descuento,
      },
      productosMasVendidos, marcas, categorias, lotes, clientes,
      reservas: {
        activas: reservasActivas.length,
        vencidas: reservasActivas.filter((reserva) => reserva.fechaVencimiento && new Date(reserva.fechaVencimiento).getTime() < hoy).length,
        convertidas: data.reservas.filter((reserva) => reserva.estado === 'confirmada').length,
      },
    };
  }), catchError((error: unknown) => {
    console.error('No se pudieron cargar los reportes:', error);
    this.loadError.set('No se pudieron cargar todos los datos de Reportes. Verifica que tu usuario tenga acceso a ventas, productos, clientes, lotes y reservas.');
    return of(null);
  }));

  limpiarFechas(): void { this.filtro.reset({ desde: '', hasta: '' }); }

  abrirMarca(marca: RankingReporte): void {
    this.dialog.open(MarcaVendidaDialogComponent, { width: 'min(860px, 96vw)', maxHeight: '90vh', data: marca });
  }

  private rank(detalles: VentaDetalleReporte[], nombre: (detalle: VentaDetalleReporte) => string): RankingReporte[] {
    const grupos = new Map<string, VentaDetalleReporte[]>();
    detalles.forEach((detalle) => grupos.set(nombre(detalle), [...(grupos.get(nombre(detalle)) ?? []), detalle]));
    return [...grupos.entries()]
      .map(([nombre, items]) => ({ nombre, cantidad: items.length, ingreso: items.reduce((s, i) => s + Number(i.venta.precioVenta), 0), ganancia: items.reduce((s, i) => s + Number(i.venta.ganancia), 0), detalles: items }))
      .sort((a, b) => b.cantidad - a.cantidad || b.ingreso - a.ingreso);
  }
}

@Component({
  selector: 'app-marca-vendida-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './marca-vendida-dialog.html',
  styleUrl: './reportes.css',
})
export class MarcaVendidaDialogComponent {
  readonly data = inject<RankingReporte>(MAT_DIALOG_DATA);
}
