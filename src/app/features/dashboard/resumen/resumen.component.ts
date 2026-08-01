import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { combineLatest, map, shareReplay } from 'rxjs';
import { precioCompraProducto, precioProducto } from '../../../core/models/producto.model';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { LoteRepository } from '../../../core/repositories/lote.repository';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    MatIconModule,
    MatListModule,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './resumen.html',
  styleUrl: './resumen.css',
})
export class ResumenComponent {
  private readonly productoRepository = inject(ProductoRepository);
  private readonly ventaRepository = inject(VentaRepository);
  private readonly loteRepository = inject(LoteRepository);

  // Una fuente compartida por colección durante la vida de esta vista.
  private readonly productosSource$ = this.productoRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly ventasSource$ = this.ventaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly lotesSource$ = this.loteRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly vm$ = combineLatest([
    this.productosSource$,
    this.ventasSource$,
    this.lotesSource$,
  ]).pipe(
    map(([productos, ventas, lotes]) => {
      const activos = productos.filter((p) => p.activo !== false);
      const disponibles = activos.filter((p) => p.estado === 'disponible');
      const vendidos = activos.filter((p) => p.estado === 'vendido');
      const ventasActivas = ventas.filter((venta) => venta.activo !== false);
      const totalInvertido = activos.reduce((total, p) => total + precioCompraProducto(p), 0);
      const totalVendido = ventasActivas.reduce((total, venta) => total + Number(venta.precioVenta), 0);
      const gananciaReal = ventasActivas.reduce((total, venta) => total + Number(venta.ganancia), 0);

      const ultimasVentas = [...ventasActivas]
        .sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime())
        .slice(0, 5);

      return {
        cards: [
          { label: 'Productos', value: activos.length, icon: 'inventory_2' },
          { label: 'Disponibles', value: disponibles.length, icon: 'sell' },
          { label: 'Vendidos', value: vendidos.length, icon: 'check_circle' },
          { label: 'Lotes activos', value: lotes.length, icon: 'local_shipping' },
          { label: 'Total invertido', value: totalInvertido, icon: 'payments', currency: true },
          { label: 'Total vendido', value: totalVendido, icon: 'point_of_sale', currency: true },
          { label: 'Ganancia real', value: gananciaReal, icon: 'paid', currency: true },
        ],
        ultimasVentas,
      };
    }),
  );
}
