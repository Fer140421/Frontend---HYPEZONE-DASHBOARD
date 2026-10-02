import { AsyncPipe, CurrencyPipe, DatePipe, UpperCasePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, map, shareReplay, startWith } from 'rxjs';
import { Caja } from '../../../core/models/caja.model';
import { Gasto } from '../../../core/models/gasto.model';
import { Venta } from '../../../core/models/venta.model';
import { CajaRepository } from '../../../core/repositories/caja.repository';
import { GastoRepository } from '../../../core/repositories/gasto.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterDrawerComponent } from '../../../shared/components/filter-drawer/filter-drawer.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';

export interface CajaItemVM {
  id: string;
  estado: 'abierta' | 'cerrada';
  usuarioNombre: string;
  usuarioEmail?: string;
  fechaApertura: string;
  fechaCierre?: string;
  montoInicial: number;
  totalVendido: number;
  totalPrendas: number;
  totalCostoPrendas: number;
  totalGanancia: number;
  totalEfectivo: number;
  totalQR: number;
  totalGastos: number;
  totalGastosEfectivo: number;
  totalEsperado: number;
  totalEsperadoGeneral: number;
  capitalMasInversion: number;
  montoFinalReal?: number;
  diferencia?: number;
  notasApertura?: string;
  notasCierre?: string;
  ventas: Venta[];
  gastos: Gasto[];
}

@Component({
  selector: 'app-cajas',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    UpperCasePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    EmptyStateComponent,
    FilterDrawerComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './cajas.html',
  styleUrl: './cajas.css',
})
export class CajasComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly cajaRepository = inject(CajaRepository);
  private readonly ventaRepository = inject(VentaRepository);
  private readonly gastoRepository = inject(GastoRepository);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly filtersOpen = signal(false);

  readonly displayedColumns = [
    'estado',
    'usuarioNombre',
    'fechaApertura',
    'fechaCierre',
    'montoInicial',
    'totalPrendas',
    'totalVendido',
    'totalCostoPrendas',
    'totalGanancia',
    'capitalMasInversion',
    'montoFinal',
    'acciones',
  ];

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    estado: ['todas'],
  });

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  private readonly cajasSource$ = this.cajaRepository.getAll(true);
  private readonly ventasSource$ = this.ventaRepository.getAll(true);
  private readonly gastosSource$ = this.gastoRepository.getAll(true);

  readonly cajasVM$ = combineLatest([this.cajasSource$, this.ventasSource$, this.gastosSource$]).pipe(
    map(([cajas, ventas, gastos]) => {
      const sorted = [...cajas].sort(
        (a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime(),
      );

      return sorted.map((caja): CajaItemVM => {
        const ventasDeCaja = ventas.filter(
          (v) => v.cajaId === caja.id && v.activo !== false,
        );
        const gastosDeCaja = gastos.filter(
          (g) => g.cajaId === caja.id && g.activo !== false,
        );

        const totalVendido = ventasDeCaja.reduce(
          (sum, v) => sum + Number(v.precioVenta || 0),
          0,
        );
        const totalPrendas = ventasDeCaja.length;
        const totalEfectivo = ventasDeCaja
          .filter((v) => v.metodoPago === 'efectivo')
          .reduce((sum, v) => sum + Number(v.precioVenta || 0), 0);
        const totalQR = ventasDeCaja
          .filter((v) => v.metodoPago === 'qr')
          .reduce((sum, v) => sum + Number(v.precioVenta || 0), 0);

        const totalCostoPrendas = caja.totalCostoPrendas ?? ventasDeCaja.reduce(
          (sum, v) => sum + Number(v.precioCompra || 0),
          0,
        );
        const totalGanancia = caja.totalGanancia ?? ventasDeCaja.reduce(
          (sum, v) =>
            sum +
            Number(
              v.ganancia !== undefined && v.ganancia !== null
                ? v.ganancia
                : Number(v.precioVenta || 0) - Number(v.precioCompra || 0),
            ),
          0,
        );

        const totalGastos = gastosDeCaja.reduce((sum, g) => sum + Number(g.monto || 0), 0);
        const totalGastosEfectivo = gastosDeCaja
          .filter((g) => g.metodoPago === 'caja_efectivo')
          .reduce((sum, g) => sum + Number(g.monto || 0), 0);

        const baseInicial = Number(caja.montoInicial || 0);
        const totalEsperado = caja.totalEsperadoEfectivo ?? (baseInicial + totalEfectivo - totalGastosEfectivo);
        const totalEsperadoGeneral = caja.totalEsperadoGeneral ?? (baseInicial + totalVendido - totalGastos);
        const capitalMasInversion = caja.capitalMasInversion ?? (baseInicial + totalCostoPrendas);

        return {
          id: caja.id ?? '',
          estado: caja.estado,
          usuarioNombre: caja.usuarioNombre || 'Usuario',
          usuarioEmail: caja.usuarioEmail,
          fechaApertura: caja.fechaApertura,
          fechaCierre: caja.fechaCierre,
          montoInicial: baseInicial,
          totalVendido,
          totalPrendas,
          totalCostoPrendas,
          totalGanancia,
          totalEfectivo,
          totalQR,
          totalGastos,
          totalGastosEfectivo,
          totalEsperado,
          totalEsperadoGeneral,
          capitalMasInversion,
          montoFinalReal: caja.montoFinalReal,
          diferencia: caja.diferencia,
          notasApertura: caja.notasApertura,
          notasCierre: caja.notasCierre,
          ventas: ventasDeCaja,
          gastos: gastosDeCaja,
        };
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly kpis$ = this.cajasVM$.pipe(
    map((cajas) => {
      const abiertas = cajas.filter((c) => c.estado === 'abierta');
      const totalVendidoAbiertas = abiertas.reduce((sum, c) => sum + c.totalVendido, 0);
      const totalPrendasAbiertas = abiertas.reduce((sum, c) => sum + c.totalPrendas, 0);
      const totalInversionAbiertas = abiertas.reduce((sum, c) => sum + c.totalCostoPrendas, 0);
      const totalGananciaAbiertas = abiertas.reduce((sum, c) => sum + c.totalGanancia, 0);

      return {
        cajasAbiertasCount: abiertas.length,
        totalVendidoAbiertas,
        totalPrendasAbiertas,
        totalInversionAbiertas,
        totalGananciaAbiertas,
        totalCajas: cajas.length,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly cajasFiltradas$ = combineLatest([
    this.cajasVM$,
    this.filters.controls.search.valueChanges.pipe(
      startWith(this.filters.controls.search.getRawValue()),
    ),
    this.filters.controls.estado.valueChanges.pipe(
      startWith(this.filters.controls.estado.getRawValue()),
    ),
  ]).pipe(
    map(([cajas, search, estado]) => {
      const term = search.toLowerCase().trim();
      return cajas.filter((caja) => {
        const matchesTerm =
          !term ||
          caja.usuarioNombre.toLowerCase().includes(term) ||
          (caja.usuarioEmail ?? '').toLowerCase().includes(term);

        const matchesEstado =
          estado === 'todas' ||
          (estado === 'abiertas' && caja.estado === 'abierta') ||
          (estado === 'cerradas' && caja.estado === 'cerrada');

        return matchesTerm && matchesEstado;
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly listViewModel$ = combineLatest({
    cajas: this.cajasFiltradas$,
    pagination: this.pagination$,
  }).pipe(
    map(({ cajas, pagination }) => ({
      cajas: paginateItems(cajas, pagination),
    })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPage());
    this.filters.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetPage());
  }

  openFilters(): void {
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    this.resetPage();
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private resetPage(): void {
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  verDetalleCaja(caja: CajaItemVM): void {
    this.dialog.open(CajaDetalleDialogComponent, {
      width: 'min(720px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '92vh',
      autoFocus: false,
      data: { caja },
    });
  }
}

@Component({
  selector: 'app-caja-detalle-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    UpperCasePipe,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatTableModule,
    EmptyStateComponent,
  ],
  templateUrl: './caja-detalle-dialog.html',
  styleUrl: './cajas.css',
})
export class CajaDetalleDialogComponent {
  private readonly ref = inject(MatDialogRef<CajaDetalleDialogComponent>);
  readonly data = inject<{ caja: CajaItemVM }>(MAT_DIALOG_DATA);

  readonly displayedColumns = ['fechaVenta', 'nombreProducto', 'metodoPago', 'costo', 'ganancia', 'precioVenta'];
  readonly displayedColumnsGastos = ['fecha', 'concepto', 'categoria', 'metodoPago', 'monto'];

  cerrar(): void {
    this.ref.close();
  }
}
