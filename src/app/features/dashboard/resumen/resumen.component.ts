import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { combineLatest, map, shareReplay } from 'rxjs';
import { marcaImagen } from '../../../core/models/catalogo.model';
import { precioCompraProducto, precioProducto } from '../../../core/models/producto.model';
import { GastoRepository } from '../../../core/repositories/gasto.repository';
import { LoteRepository } from '../../../core/repositories/lote.repository';
import { MarcaRepository } from '../../../core/repositories/marca.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

export interface ResumenMetricCard {
  label: string;
  value: string | number;
  icon: string;
  imageUrl?: string;
  currency?: boolean;
  type:
    | 'ganancia'
    | 'vendido'
    | 'invertido'
    | 'utilidad_neta'
    | 'gastos'
    | 'stock_costo'
    | 'stock_venta'
    | 'top_marca'
    | 'productos'
    | 'disponibles'
    | 'por_recoger'
    | 'vendidos'
    | 'lotes';
  subtext: string;
  featured?: boolean;
}

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
  private readonly marcaRepository = inject(MarcaRepository);
  private readonly gastoRepository = inject(GastoRepository);

  // Fuentes compartidas durante la vida de la vista.
  private readonly productosSource$ = this.productoRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly ventasSource$ = this.ventaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly lotesSource$ = this.loteRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly marcasSource$ = this.marcaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly gastosSource$ = this.gastoRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly vm$ = combineLatest([
    this.productosSource$,
    this.ventasSource$,
    this.lotesSource$,
    this.marcasSource$,
    this.gastosSource$,
  ]).pipe(
    map(([productos, ventas, lotes, marcas, gastos]) => {
      const activos = productos.filter((p) => p.activo !== false);
      const disponibles = activos.filter((p) => p.estado === 'disponible');
      const porRecoger = activos.filter((p) => p.estado === 'por_recoger');
      const vendidos = activos.filter((p) => p.estado === 'vendido');
      const capitalPorRecoger = porRecoger.reduce((total, p) => total + precioCompraProducto(p), 0);
      const ventasActivas = ventas.filter((venta) => venta.activo !== false);
      const gastosActivos = gastos.filter((g) => g.activo !== false);

      const totalVendido = ventasActivas.reduce((total, venta) => total + Number(venta.precioVenta), 0);
      const margenBrutoVentas = ventasActivas.reduce((total, venta) => total + Number(venta.ganancia || 0), 0);
      const totalGastos = gastosActivos.reduce((total, g) => total + Number(g.monto || 0), 0);
      const utilidadNetaReal = margenBrutoVentas - totalGastos;

      const valorStockCosto = disponibles.reduce((total, p) => total + precioCompraProducto(p), 0);
      const valorStockVenta = disponibles.reduce((total, p) => total + precioProducto(p), 0);

      // Cálculo de la marca más vendida
      const productoMap = new Map(productos.map((p) => [p.id, p]));
      const marcaStats = new Map<string, { cantidad: number; totalRecaudado: number }>();

      for (const venta of ventasActivas) {
        const prod = productoMap.get(venta.productoId);
        const nombreMarca = prod?.marca && prod.marca.trim() ? prod.marca.trim() : 'Sin marca';
        const actual = marcaStats.get(nombreMarca) || { cantidad: 0, totalRecaudado: 0 };
        marcaStats.set(nombreMarca, {
          cantidad: actual.cantidad + 1,
          totalRecaudado: actual.totalRecaudado + Number(venta.precioVenta || 0),
        });
      }

      let topMarca: { nombre: string; cantidad: number; totalRecaudado: number; imagenUrl?: string } | null = null;
      for (const [nombre, stats] of marcaStats.entries()) {
        if (!topMarca || stats.cantidad > topMarca.cantidad) {
          topMarca = { nombre, ...stats };
        }
      }

      if (topMarca) {
        const entity = marcas.find(
          (m) => m.nombre.trim().toLowerCase() === topMarca!.nombre.trim().toLowerCase(),
        );
        if (entity) {
          topMarca.imagenUrl = marcaImagen(entity);
        }
      }

      const ultimasVentas = [...ventasActivas]
        .sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime())
        .slice(0, 5)
        .map((venta) => {
          const prod = productoMap.get(venta.productoId);
          const imagenProducto = prod?.imagenes && prod.imagenes.length > 0 ? prod.imagenes[0] : undefined;
          return {
            ...venta,
            imagenProducto,
          };
        });

      const financialCards: ResumenMetricCard[] = [
        {
          label: 'Utilidad Neta Real',
          value: utilidadNetaReal,
          icon: 'account_balance_wallet',
          currency: true,
          type: 'utilidad_neta',
          subtext: 'Margen ventas menos gastos',
          featured: true,
        },
        {
          label: 'Margen Bruto Ventas',
          value: margenBrutoVentas,
          icon: 'paid',
          currency: true,
          type: 'ganancia',
          subtext: `${ventasActivas.length} venta(s) realizadas`,
        },
        {
          label: 'Gastos Operativos',
          value: totalGastos,
          icon: 'payments',
          currency: true,
          type: 'gastos',
          subtext: 'Fletes, bolsas, pasajes y servicios',
        },
        {
          label: 'Capital en Stock (A costo)',
          value: valorStockCosto,
          icon: 'inventory_2',
          currency: true,
          type: 'stock_costo',
          subtext: `${disponibles.length} prendas listas para venta`,
        },
      ];

      const lotesActivos = lotes.filter((lote) => {
        if (lote.activo === false) return false;
        const productosLote = activos.filter((p) => p.loteId === lote.id);
        return productosLote.some((p) => p.estado === 'disponible');
      });

      // Ventas del día de hoy
      const ahora = new Date();
      const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
      const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999).getTime();

      const ventasHoy = ventasActivas.filter((v) => {
        const fecha = new Date(v.fechaVenta).getTime();
        return fecha >= inicioHoy && fecha <= finHoy;
      });

      const totalVendidoHoy = ventasHoy.reduce((sum, v) => sum + Number(v.precioVenta || 0), 0);

      const operationalCards: ResumenMetricCard[] = [
        {
          label: 'Marca más vendida',
          value: topMarca ? topMarca.nombre : 'Sin ventas',
          icon: 'workspace_premium',
          imageUrl: topMarca?.imagenUrl,
          type: 'top_marca',
          subtext: topMarca
            ? `${topMarca.cantidad} ${topMarca.cantidad === 1 ? 'unidad vendida' : 'unidades vendidas'}`
            : 'Sin registro aún',
          featured: true,
        },
        {
          label: 'Disponibles',
          value: disponibles.length,
          icon: 'sell',
          type: 'disponibles',
          subtext: 'Listos para la venta',
        },
        {
          label: 'Por Recoger',
          value: porRecoger.length,
          icon: 'local_shipping',
          type: 'por_recoger',
          subtext: capitalPorRecoger > 0
            ? `Capital: ${capitalPorRecoger.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`
            : 'Sin prendas pendientes',
        },
        {
          label: 'Ventas del día',
          value: ventasHoy.length,
          icon: 'point_of_sale',
          type: 'vendidos',
          subtext: ventasHoy.length > 0
            ? `${totalVendidoHoy.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs. cobrados hoy`
            : 'Sin ventas hoy',
        },
        {
          label: 'Lotes activos',
          value: lotesActivos.length,
          icon: 'local_shipping',
          type: 'lotes',
          subtext: 'Con prendas para venta',
        },
      ];

      return {
        financialCards,
        operationalCards,
        ultimasVentas,
      };
    }),
  );
}


