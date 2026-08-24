import { AsyncPipe, CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
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
import { cloudinaryCardUrl } from '../../../core/utils/cloudinary-image.util';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

interface VentaDetalleReporte { venta: Venta; producto?: Producto; }
interface RankingReporte { nombre: string; cantidad: number; ingreso: number; ganancia: number; detalles: VentaDetalleReporte[]; }
interface ClienteReporte extends RankingReporte { cliente?: Cliente; }
interface ReportesData { detalles: VentaDetalleReporte[]; ventas: Venta[]; productos: Producto[]; clientes: Cliente[]; lotes: Lote[]; reservas: Reserva[]; }
type ReportTab = 'ventas' | 'marcas' | 'productos' | 'categorias' | 'lotes' | 'clientes' | 'reservas';

@Component({
  selector: 'app-reportes', standalone: true,
  imports: [AsyncPipe, CurrencyPipe, NgTemplateOutlet, ReactiveFormsModule, MatButtonModule, MatCardModule, MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule, MatNativeDateModule, MatSnackBarModule, MatTabsModule, PageHeaderComponent],
  templateUrl: './reportes.html', styleUrl: './reportes.css',
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
  readonly pestanaActiva = signal<ReportTab>('ventas');
  readonly filtros = {
    ventas: this.crearFiltro(), marcas: this.crearFiltro(), productos: this.crearFiltro(),
    categorias: this.crearFiltro(), lotes: this.crearFiltro(), clientes: this.crearFiltro(), reservas: this.crearFiltro(),
  };

  private readonly ventas$ = this.ventas.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly productos$ = this.productos.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly clientes$ = this.clientes.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly lotes$ = this.lotes.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly reservas$ = this.reservas.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly data$ = combineLatest([this.ventas$, this.productos$, this.clientes$, this.lotes$, this.reservas$]).pipe(
    map(([ventas, productos, clientes, lotes, reservas]) => {
      const productosPorId = new Map(productos.map((producto) => [producto.id, producto]));
      const ventasActivas = ventas.filter((venta) => venta.activo !== false);
      return { detalles: ventasActivas.map((venta) => ({ venta, producto: productosPorId.get(venta.productoId) })), ventas: ventasActivas, productos, clientes, lotes, reservas: reservas.filter((reserva) => reserva.activo !== false) } satisfies ReportesData;
    }), shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly viewModel$ = combineLatest([this.data$, ...Object.values(this.filtros).map((filtro) => filtro.valueChanges.pipe(startWith(filtro.getRawValue())))]).pipe(
    map(([data]) => this.crearVista(data)), catchError((error: unknown) => {
      console.error('No se pudieron cargar los reportes:', error);
      this.loadError.set('No se pudieron cargar todos los datos de Reportes. Verifica que tu usuario tenga acceso a ventas, productos, clientes, lotes y reservas.');
      return of(null);
    }),
  );

  seleccionarIndice(index: number): void {
    const tabs: ReportTab[] = ['ventas', 'marcas', 'productos', 'categorias', 'lotes', 'clientes', 'reservas'];
    const tab = tabs[index];
    this.pestanaActiva.set(tab);
    this.filtros[tab].updateValueAndValidity();
  }
  filtroDe(tab: string) { return this.filtros[tab as ReportTab]; }
  limpiarFechas(tab: string): void { this.filtros[tab as ReportTab].reset({ desde: null, hasta: null }); }
  abrirMarca(marca: RankingReporte): void { this.dialog.open(MarcaVendidaDialogComponent, { width: 'min(860px, 96vw)', maxHeight: '90vh', data: marca }); }

  private crearVista(data: ReportesData) {
    const filtro = this.filtros[this.pestanaActiva()].getRawValue();
    const vista = this.filtrarPorFecha(data, filtro.desde, filtro.hasta);
    const operaciones = new Set(vista.ventas.map((venta) => venta.operacionId ?? venta.id)).size;
    const productosMasVendidos = this.rank(vista.detalles, (detalle) => detalle.venta.nombreProducto);
    const marcas = this.rank(vista.detalles, (detalle) => detalle.producto?.marca || 'Sin marca');
    const categorias = this.rank(vista.detalles, (detalle) => detalle.producto?.categoria || 'Sin categoría');
    const lotesPorId = new Map(vista.lotes.map((lote) => [lote.id, lote.nombre]));
    const lotes = this.rank(vista.detalles, (detalle) => lotesPorId.get(detalle.venta.loteId) || 'Sin lote');
    const clientesPorId = new Map(vista.clientes.map((cliente) => [cliente.id, cliente]));
    const clientes = this.rank(vista.detalles, (detalle) => detalle.venta.clienteNombre || 'Venta sin cliente').map((item) => ({ ...item, cliente: item.detalles[0]?.venta.clienteId ? clientesPorId.get(item.detalles[0].venta.clienteId) : undefined })).slice(0, 10) as ClienteReporte[];
    const reservasActivas = vista.reservas.filter((reserva) => reserva.estado === 'activa');
    const hoy = new Date().setHours(0, 0, 0, 0);
    return {
      ...vista,
      metricas: { operaciones, prendas: vista.detalles.length, ingreso: vista.ventas.reduce((total, venta) => total + Number(venta.precioVenta), 0), ganancia: vista.ventas.reduce((total, venta) => total + Number(venta.ganancia), 0), descuento: vista.ventas.reduce((total, venta) => total + Number(venta.descuentoAplicado ?? 0), 0) },
      productosMasVendidos, marcas, categorias, lotes, clientes,
      reservas: { total: vista.reservas.length, activas: reservasActivas.length, vencidas: reservasActivas.filter((reserva) => reserva.fechaVencimiento && new Date(reserva.fechaVencimiento).getTime() < hoy).length, convertidas: vista.reservas.filter((reserva) => reserva.estado === 'confirmada').length },
    };
  }

  private filtrarPorFecha(data: ReportesData, desde: Date | null, hasta: Date | null): ReportesData {
    const inicio = desde ? new Date(desde).setHours(0, 0, 0, 0) : 0;
    const fin = hasta ? new Date(hasta).setHours(23, 59, 59, 999) : Number.POSITIVE_INFINITY;
    const enRango = (fecha: string | Date) => { const valor = new Date(fecha).getTime(); return valor >= inicio && valor <= fin; };
    const ventas = data.ventas.filter((venta) => enRango(venta.fechaVenta));
    const ventasIds = new Set(ventas.map((venta) => venta.id));
    return { ...data, ventas, detalles: data.detalles.filter((detalle) => ventasIds.has(detalle.venta.id)), reservas: data.reservas.filter((reserva) => enRango(reserva.fechaReserva)) };
  }

  private crearFiltro() { return this.fb.group({ desde: [null as Date | null], hasta: [null as Date | null] }); }
  private rank(detalles: VentaDetalleReporte[], nombre: (detalle: VentaDetalleReporte) => string): RankingReporte[] {
    const grupos = new Map<string, VentaDetalleReporte[]>();
    detalles.forEach((detalle) => grupos.set(nombre(detalle), [...(grupos.get(nombre(detalle)) ?? []), detalle]));
    return [...grupos.entries()].map(([nombre, items]) => ({ nombre, cantidad: items.length, ingreso: items.reduce((s, i) => s + Number(i.venta.precioVenta), 0), ganancia: items.reduce((s, i) => s + Number(i.venta.ganancia), 0), detalles: items })).sort((a, b) => b.cantidad - a.cantidad || b.ingreso - a.ingreso);
  }
}

@Component({ selector: 'app-marca-vendida-dialog', standalone: true, imports: [CurrencyPipe, DatePipe, MatButtonModule, MatDialogModule, MatIconModule], templateUrl: './marca-vendida-dialog.html', styleUrl: './reportes.css' })
export class MarcaVendidaDialogComponent {
  readonly data = inject<RankingReporte>(MAT_DIALOG_DATA);

  image(detalle: VentaDetalleReporte): string {
    return cloudinaryCardUrl(detalle.producto?.imagenes?.[0] ?? '');
  }
}
