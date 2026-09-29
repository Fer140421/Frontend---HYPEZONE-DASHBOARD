import { AsyncPipe, CurrencyPipe, DatePipe, UpperCasePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, map, shareReplay, startWith } from 'rxjs';
import { CATEGORIAS_GASTO, CategoriaGasto, Gasto, MetodoPagoGasto } from '../../../core/models/gasto.model';
import { AuthService } from '../../../core/services/auth.service';
import { GastoService } from '../../../core/services/gasto.service';
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
import { GastoDialogComponent } from './gasto-dialog.component';

@Component({
  selector: 'app-gastos',
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
  templateUrl: './gastos.html',
  styleUrl: './gastos.css',
})
export class GastosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly gastoService = inject(GastoService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  readonly categorias = CATEGORIAS_GASTO;
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly filtersOpen = signal(false);

  readonly displayedColumns = [
    'fecha',
    'concepto',
    'categoria',
    'metodoPago',
    'caja',
    'usuarioNombre',
    'monto',
    'acciones',
  ];

  readonly filters = this.fb.nonNullable.group({
    search: [''],
    categoria: ['todas'],
    metodoPago: ['todos'],
  });

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly gastos$ = this.gastoService.gastos$;

  readonly kpis$ = this.gastos$.pipe(
    map((gastos) => {
      const resumen = this.gastoService.calcularResumen(gastos);
      return {
        total: resumen.total,
        totalCaja: resumen.totalCaja,
        totalBanco: resumen.totalBanco,
        cantidad: gastos.filter((g) => g.activo !== false).length,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly gastosFiltrados$ = combineLatest([
    this.gastos$,
    this.filters.controls.search.valueChanges.pipe(
      startWith(this.filters.controls.search.getRawValue()),
    ),
    this.filters.controls.categoria.valueChanges.pipe(
      startWith(this.filters.controls.categoria.getRawValue()),
    ),
    this.filters.controls.metodoPago.valueChanges.pipe(
      startWith(this.filters.controls.metodoPago.getRawValue()),
    ),
  ]).pipe(
    map(([gastos, search, categoria, metodoPago]) => {
      const term = search.toLowerCase().trim();
      return gastos.filter((g) => {
        if (g.activo === false) return false;

        const matchesTerm =
          !term ||
          g.concepto.toLowerCase().includes(term) ||
          g.usuarioNombre.toLowerCase().includes(term) ||
          (g.notas && g.notas.toLowerCase().includes(term));

        const matchesCategoria = categoria === 'todas' || g.categoria === categoria;
        const matchesMetodo = metodoPago === 'todos' || g.metodoPago === metodoPago;

        return matchesTerm && matchesCategoria && matchesMetodo;
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly pagedGastos$ = combineLatest([this.gastosFiltrados$, this.pagination$]).pipe(
    map(([gastos, pagination]) => paginateItems(gastos, pagination)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  ngOnInit(): void {
    this.filters.valueChanges.subscribe(() => {
      this.resetPage();
    });
  }

  openFilters(): void {
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    this.filtersOpen.set(false);
    this.resetPage();
  }

  clearFilters(): void {
    this.filters.reset({
      search: '',
      categoria: 'todas',
      metodoPago: 'todos',
    });
    this.resetPage();
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private resetPage(): void {
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  abrirModalCrear(): void {
    this.dialog.open(GastoDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '92vh',
      autoFocus: false,
    });
  }

  editarGasto(gasto: Gasto): void {
    this.dialog.open(GastoDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      maxHeight: '92vh',
      autoFocus: false,
      data: { gasto },
    });
  }

  async eliminarGasto(gasto: Gasto): Promise<void> {
    if (!gasto.id) return;
    const confirm = window.confirm(`¿Estás seguro de eliminar el gasto "${gasto.concepto}"?`);
    if (!confirm) return;

    try {
      await this.gastoService.eliminarGasto(gasto.id);
      this.snackBar.open('Gasto eliminado.', 'OK', { duration: 3000 });
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Error al eliminar el gasto.',
        'OK',
        { duration: 4000 },
      );
    }
  }

  obtenerCategoriaLabel(catId: CategoriaGasto): string {
    const item = this.categorias.find((c) => c.id === catId);
    return item ? item.label : catId;
  }
}
