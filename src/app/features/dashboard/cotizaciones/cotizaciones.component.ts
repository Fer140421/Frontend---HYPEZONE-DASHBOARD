import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Observable, map, shareReplay } from 'rxjs';
import { Cliente } from '../../../core/models/cliente.model';
import { Cotizacion, CotizacionDetalle } from '../../../core/models/cotizacion.model';
import { Producto, precioProducto } from '../../../core/models/producto.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { CotizacionRepository } from '../../../core/repositories/cotizacion.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { AuthService } from '../../../core/services/auth.service';
import { CotizacionService } from '../../../core/services/cotizacion.service';
import { cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-cotizaciones',
  standalone: true,
  imports: [
    AsyncPipe, CurrencyPipe, DatePipe, ReactiveFormsModule,
    MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatSelectModule, MatSnackBarModule, PageHeaderComponent,
  ],
  templateUrl: './cotizaciones.html',
  styleUrl: './cotizaciones.css',
})
export class CotizacionesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly clienteRepository = inject(ClienteRepository);
  private readonly productoRepository = inject(ProductoRepository);
  private readonly quoteRepository = inject(CotizacionRepository);
  private readonly quoteService = inject(CotizacionService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly creando = signal(false);
  readonly guardando = signal(false);
  readonly lineas = signal<CotizacionDetalle[]>([]);
  private clientes: Cliente[] = [];
  private productos: Producto[] = [];
  readonly productos$ = this.productoRepository.getAll().pipe(
    map((items) => items.filter((item) => item.estado === 'disponible')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly clientes$ = this.clienteRepository.getAll().pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly cotizaciones$: Observable<Cotizacion[]> = this.quoteRepository.getAll().pipe(
    map((items) => [...items].sort((a, b) => b.fechaCotizacion.localeCompare(a.fechaCotizacion))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly form = this.fb.nonNullable.group({
    clienteId: ['', Validators.required],
    productoIds: [[] as string[]],
    vigenciaDias: [7, [Validators.required, Validators.min(1), Validators.max(90)]],
    notas: [''],
  });

  ngOnInit(): void {
    this.clientes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((items) => this.clientes = items);
    this.productos$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((items) => this.productos = items);
    this.form.controls.productoIds.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ids) => this.actualizarLineas(ids));
  }

  get total(): number {
    return this.lineas().reduce((sum, item) => sum + Number(item.precioCotizado || 0), 0);
  }

  setPrice(productoId: string, value: string): void {
    const price = Number(value);
    this.lineas.update((items) => items.map((item) => item.productoId === productoId
      ? { ...item, precioCotizado: Number.isFinite(price) ? price : 0 }
      : item));
  }

  cancelarCreacion(): void {
    this.creando.set(false);
    this.lineas.set([]);
    this.form.reset({ clienteId: '', productoIds: [], vigenciaDias: 7, notas: '' });
  }

  async guardar(): Promise<void> {
    if (!this.auth.can('sales.create') || this.form.invalid || !this.lineas().length) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const cliente = this.clientes.find((item) => item.id === raw.clienteId);
    if (!cliente) {
      this.message('Selecciona un cliente válido.');
      return;
    }
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + Number(raw.vigenciaDias));
    this.guardando.set(true);
    try {
      await this.quoteService.crear({
        cliente,
        detalles: this.lineas(),
        fechaVencimiento: fechaVencimiento.toISOString(),
        notas: raw.notas,
      });
      this.message('Cotización guardada. El inventario sigue disponible.');
      this.cancelarCreacion();
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo guardar la cotización.');
    } finally {
      this.guardando.set(false);
    }
  }

  async convertir(quote: Cotizacion): Promise<void> {
    if (!this.auth.can('sales.create') || !quote.id) return;
    try {
      const reservaId = await this.quoteService.convertirAReserva(quote.id);
      this.message('Cotización convertida en reserva; las prendas quedaron apartadas.');
      await this.router.navigate(['/dashboard/reservas', reservaId, 'editar']);
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo convertir la cotización.');
    }
  }

  estado(quote: Cotizacion): string {
    if (quote.estado === 'vigente' && new Date(quote.fechaVencimiento).getTime() < Date.now()) return 'Vencida';
    return quote.estado === 'vigente' ? 'Vigente' : quote.estado === 'convertida' ? 'Convertida en reserva' : 'Cancelada';
  }

  private actualizarLineas(ids: string[]): void {
    const actuales = new Map(this.lineas().map((item) => [item.productoId, item]));
    this.lineas.set(ids.flatMap((id) => {
      const producto = this.productos.find((item) => item.id === id);
      if (!producto) return [];
      return [actuales.get(id) ?? {
        productoId: id,
        nombreProducto: producto.nombre,
        codigo: producto.codigo,
        imagen: producto.imagenes?.[0] ? cloudinaryThumbnailUrl(producto.imagenes[0]) : undefined,
        precioCotizado: precioProducto(producto),
      }];
    }));
  }

  private message(message: string): void {
    this.snack.open(message, 'OK', { duration: 4000 });
  }
}
