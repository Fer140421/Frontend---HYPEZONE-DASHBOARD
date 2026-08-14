import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, take } from 'rxjs';
import { Lote, emptyLote, loteFechaCompra } from '../../../core/models/lote.model';
import { Proveedor } from '../../../core/models/proveedor.model';
import { LoteResumen } from '../../../core/models/lote-resumen.model';
import {
  coloresProducto,
  estadosProducto,
  generosProducto,
  GeneroProducto,
  generateProductCode,
  imagenesProducto,
  precioCompraProducto,
  precioProducto,
  Producto,
} from '../../../core/models/producto.model';
import { Venta } from '../../../core/models/venta.model';
import { CategoriaRepository } from '../../../core/repositories/categoria.repository';
import { LoteRepository } from '../../../core/repositories/lote.repository';
import { MarcaRepository } from '../../../core/repositories/marca.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { ProveedorRepository } from '../../../core/repositories/proveedor.repository';
import { TallaRepository } from '../../../core/repositories/talla.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { LoteAnalyticsService } from '../../../core/services/lote-analytics.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  LoteDeactivationMode,
  LoteDomainError,
  LoteManagementService,
} from '../../../core/services/lote-management.service';
import { cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterDrawerComponent } from '../../../shared/components/filter-drawer/filter-drawer.component';
import { ImageUploaderComponent } from '../../../shared/components/image-uploader/image-uploader.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoteDetailDialogComponent } from './lote-detail-dialog.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';

interface LotesData {
  resumenes: LoteResumen[];
  productos: Producto[];
  ventas: Venta[];
}

type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

export interface LoteDetail {
  resumen: LoteResumen;
  productos: Producto[];
  ventas: Venta[];
  productosSinPrecioCompra: Producto[];
  productosSinLote: Producto[];
  diferenciaInversion: number;
}

@Component({
  selector: 'app-lotes',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
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
    StatusChipComponent,
  ],
  templateUrl: './lotes.html',
  styleUrl: './lotes.css',
})
export class LotesComponent implements OnInit {
  readonly Math = Math;

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly lotes = inject(LoteRepository);
  private readonly productos = inject(ProductoRepository);
  private readonly ventas = inject(VentaRepository);
  private readonly proveedores = inject(ProveedorRepository);
  private readonly analytics = inject(LoteAnalyticsService);
  private readonly management = inject(LoteManagementService);
  readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  get columns(): string[] {
    return ['nombre', 'fecha', 'costo', 'productos', 'disponibles', 'vendidos', 'inversion', 'esperado', 'ingreso', 'ganancia', 'recuperacion', 'estado', 'acciones'];
  }
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly mode = signal<'list' | 'new' | 'detail' | 'edit'>('list');
  readonly viewType = inject(ViewPreferenceService).getViewSignal('lotes', 'table');
  readonly currentId = signal<string | null>(null);
  readonly filtersOpen = signal(false);
  readonly filters = this.fb.nonNullable.group({
    estado: ['activos' as EstadoFiltro],
  });
  private readonly appliedFilters$ = new BehaviorSubject<EstadoFiltro>('activos');

  private readonly lotesSource$ = this.lotes.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly productosSource$ = this.productos.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly ventasSource$ = this.ventas.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly proveedoresSource$ = this.proveedores.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private readonly baseData$ = combineLatest([
    this.lotesSource$,
    this.productosSource$,
    this.ventasSource$,
  ]).pipe(
    map(([lotes, productos, ventas]) => {
      const resumenes = this.analytics.getResumenesLotes(lotes, productos, ventas);
      return {
        resumenes,
        productos,
        ventas,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly data$ = combineLatest([this.baseData$, this.appliedFilters$, this.pagination$]).pipe(
    map(([data, estado, pagination]) => {
      const resumenes = data.resumenes.filter((resumen) =>
        estado === 'todos'
          ? true
          : estado === 'activos'
            ? resumen.lote.activo !== false
            : resumen.lote.activo === false,
      );
      return {
        ...data,
        resumenes,
        resumenesPaginados: paginateItems(resumenes, pagination),
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly detail$ = combineLatest([this.baseData$, this.route.paramMap]).pipe(
    map(([data, params]) => this.buildDetail(data, params.get('id'))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    descripcion: [''],
    fechaCompra: [new Date(), Validators.required],
    proveedorId: [''],
    lugarCompra: [''],
    costoTotal: [0, [Validators.required, Validators.min(0)]],
    notas: [''],
  });
  readonly associateForm = this.fb.nonNullable.group({
    productoId: ['', Validators.required],
  });

  ngOnInit(): void {
    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((segments) => {
      const paths = segments.map((segment) => segment.path);
      this.mode.set(
        paths.includes('nuevo')
          ? 'new'
          : paths.includes('editar')
            ? 'edit'
            : this.route.snapshot.paramMap.has('id')
              ? 'detail'
              : 'list',
      );
    });

    this.detail$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((detail) => {
      if (!detail) {
        if (this.mode() === 'new') {
          this.form.reset({
            nombre: emptyLote.nombre,
            descripcion: emptyLote.descripcion,
            fechaCompra: new Date(),
            proveedorId: emptyLote.proveedorId,
            lugarCompra: emptyLote.lugarCompra,
            costoTotal: emptyLote.costoTotal,
            notas: emptyLote.notas,
          });
        }
        return;
      }

      const lote = detail.resumen.lote;
      this.currentId.set(lote.id ?? null);
      this.form.patchValue({
        nombre: lote.nombre,
        descripcion: lote.descripcion ?? '',
        fechaCompra: loteFechaCompra(lote.fechaCompra),
        proveedorId: lote.proveedorId ?? '',
        lugarCompra: lote.lugarCompra ?? '',
        costoTotal: Number(lote.costoTotal),
        notas: lote.notas ?? '',
      });
    });
  }

  openFilters(): void {
    this.filters.patchValue({ estado: this.appliedFilters$.value }, { emitEvent: false });
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    this.appliedFilters$.next(this.filters.controls.estado.getRawValue());
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  fecha(value: Lote['fechaCompra']): Date {
    return loteFechaCompra(value);
  }

  proveedorLabel(proveedor: Proveedor): string {
    return proveedor.activo === false
      ? `${proveedor.nombreCompleto} (inactivo)`
      : proveedor.nombreCompleto;
  }

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  precioCompra(producto: Producto): number {
    return precioCompraProducto(producto);
  }

  foto(producto: Producto): string {
    return cloudinaryThumbnailUrl(imagenesProducto(producto)[0] ?? '');
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  async save(): Promise<void> {
    if (this.currentId() ? !this.auth.can('lots.update') : !this.auth.can('lots.create')) {
      return;
    }
    const raw = this.form.getRawValue();
    const proveedores = await firstValueFrom(this.proveedoresSource$.pipe(take(1)));
    const proveedor = proveedores.find((item) => item.id === raw.proveedorId);
    const payload: Partial<Lote> = {
      nombre: raw.nombre.trim(),
      descripcion: raw.descripcion.trim() || undefined,
      fechaCompra: Timestamp.fromDate(raw.fechaCompra),
      proveedorId: raw.proveedorId || undefined,
      proveedor: proveedor?.nombreCompleto || undefined,
      lugarCompra: raw.lugarCompra.trim() || undefined,
      costoTotal: Number(raw.costoTotal),
      notas: raw.notas.trim() || undefined,
      schemaVersion: 3,
    };

    try {
      if (this.currentId()) {
        await this.lotes.update(this.currentId()!, payload);
        this.message('Lote actualizado correctamente.');
        await this.router.navigate(['/dashboard/lotes']);
      } else {
        const id = await this.lotes.create({ ...payload, cantidadProductos: 0, activo: true });
        this.message('Lote creado correctamente.');
        await this.router.navigate(['/dashboard/lotes', id, 'editar']);
      }
    } catch (error) {
      this.showError(error);
    }
  }

  async openDetailModal(id: string): Promise<void> {
    const data = await firstValueFrom(this.baseData$);
    const detail = this.buildDetail(data, id);
    if (!detail) return;

    this.dialog.open(LoteDetailDialogComponent, {
      data: { detail },
      width: '92vw',
      maxWidth: '820px',
      maxHeight: '90vh',
    });
  }

  openProductDialog(lote: Lote): void {
    if (!this.auth.can('products.create') || !lote.id || lote.activo === false) {
      return;
    }
    this.dialog.open(LoteProductCreateDialogComponent, {
      width: 'min(920px, 96vw)',
      maxHeight: '94vh',
      data: { loteId: lote.id },
    });
  }

  async associate(lote: Lote): Promise<void> {
    if (!this.auth.can('lots.update') || !lote.id) {
      return;
    }
    try {
      await this.management.associateProduct(lote.id, this.associateForm.getRawValue().productoId);
      this.associateForm.reset({ productoId: '' });
      this.message('Producto asociado al lote.');
    } catch (error) {
      if (
        error instanceof LoteDomainError &&
        error.code === 'CONFIRMAR_REASIGNACION_VENDIDO'
      ) {
        this.confirmHistoricalMove(lote, this.associateForm.getRawValue().productoId, error.message);
        return;
      }
      this.showError(error);
    }
  }

  confirmUnlink(lote: Lote, producto: Producto): void {
    if (!this.auth.can('lots.update') || !lote.id || !producto.id) {
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Quitar producto del lote',
          message: `Se quitará "${producto.nombre}" del lote sin eliminar el producto del sistema.`,
          confirmText: 'Quitar del lote',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        try {
          await this.management.unlinkProduct(lote.id!, producto.id!);
          this.message('Producto quitado del lote.');
        } catch (error) {
          this.showError(error);
        }
      });
  }

  deactivate(detail: LoteDetail): void {
    const lote = detail.resumen.lote;
    if (!this.auth.can('lots.delete') || !lote.id) {
      return;
    }
    const ref = this.dialog.open(LoteDeactivateDialogComponent, {
      data: { nombre: lote.nombre, cantidad: detail.productos.length },
    });
    ref.afterClosed().subscribe(async (mode?: LoteDeactivationMode) => {
      if (!mode) {
        return;
      }
      try {
        await this.management.deactivateLote(lote.id!, mode);
        this.message('Lote desactivado correctamente.');
      } catch (error) {
        this.showError(error);
      }
    });
  }

  async restore(lote: Lote): Promise<void> {
    if (!this.auth.can('lots.delete') || !lote.id) {
      return;
    }
    try {
      await this.management.restoreLote(lote.id);
      this.message('Lote restaurado correctamente.');
    } catch (error) {
      this.showError(error);
    }
  }

  private confirmHistoricalMove(lote: Lote, productoId: string, message: string): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Confirmar reasignacion',
          message,
          confirmText: 'Reasignar producto',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed || !lote.id) {
          return;
        }
        try {
          await this.management.associateProduct(lote.id, productoId, true);
          this.associateForm.reset({ productoId: '' });
          this.message('Producto asociado al lote.');
        } catch (error) {
          this.showError(error);
        }
      });
  }

  private buildDetail(data: LotesData, id: string | null): LoteDetail | null {
    const resumen = data.resumenes.find((item) => item.lote.id === id);
    if (!resumen) {
      return null;
    }
    const productos = data.productos.filter((producto) => producto.activo !== false && producto.loteId === id);
    const ventas = data.ventas.filter(
      (venta) => venta.activo !== false && this.analytics.ventaPerteneceAlLote(venta, id, data.productos),
    );
    return {
      resumen,
      productos,
      ventas,
      productosSinPrecioCompra: productos.filter((producto) => !Number(producto.precioCompra)),
      productosSinLote: data.productos.filter((producto) => producto.activo !== false && !producto.loteId),
      diferenciaInversion: Number(resumen.lote.costoTotal) - resumen.inversionAsignada,
    };
  }

  private message(text: string): void {
    this.snackBar.open(text, 'OK', { duration: 2800 });
  }

  private showError(error: unknown): void {
    this.message(error instanceof Error ? error.message : 'No se pudo completar la operacion.');
  }
}

@Component({
  selector: 'app-lote-product-create-dialog',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ImageUploaderComponent,
  ],
  templateUrl: './lote-product-create-dialog.html',
  styleUrl: './lote-product-create-dialog.css',
})
export class LoteProductCreateDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly productos = inject(ProductoRepository);
  private readonly categoriaRepository = inject(CategoriaRepository);
  private readonly marcaRepository = inject(MarcaRepository);
  private readonly tallaRepository = inject(TallaRepository);
  private readonly ref = inject(MatDialogRef<LoteProductCreateDialogComponent>);
  private readonly snack = inject(MatSnackBar);

  readonly data = inject<{ loteId: string }>(MAT_DIALOG_DATA);
  readonly categorias$ = this.categoriaRepository.getAll();
  readonly marcas$ = this.marcaRepository.getAll();
  readonly tallas$ = this.tallaRepository.getAll();
  readonly estados = estadosProducto;
  readonly generos = generosProducto;
  readonly colores = coloresProducto;
  readonly imagenes = signal<string[]>([]);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    marca: [''],
    categoria: ['otro', Validators.required],
    descripcion: ['', Validators.required],
    talla: ['', Validators.required],
    color: [''],
    genero: [''],
    precioCompra: [0, [Validators.required, Validators.min(0)]],
    precioVenta: [0, [Validators.required, Validators.min(0)]],
    estado: ['disponible', Validators.required],
    codigo: [generateProductCode()],
  });

  async saveAndContinue(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.productos.create({
        ...raw,
        codigo: raw.codigo || generateProductCode(),
        loteId: this.data.loteId,
        genero: (raw.genero || undefined) as GeneroProducto | undefined,
        imagenes: this.imagenes(),
        activo: true,
      } as Partial<Producto>);
      this.message('Producto agregado al lote.');
      this.form.reset({
        nombre: '',
        marca: '',
        categoria: 'otro',
        descripcion: '',
        talla: '',
        color: '',
        genero: '',
        precioCompra: 0,
        precioVenta: 0,
        estado: 'disponible',
        codigo: generateProductCode(),
      });
      this.imagenes.set([]);
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo guardar el producto.');
    } finally {
      this.saving.set(false);
    }
  }

  finish(): void {
    this.ref.close();
  }

  message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2500 });
  }
}

@Component({
  selector: 'app-lote-deactivate-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  templateUrl: './lote-deactivate-dialog.html',
  styleUrl: './lote-deactivate-dialog.css',
})
export class LoteDeactivateDialogComponent {
  readonly data = inject<{ nombre: string; cantidad: number }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<LoteDeactivateDialogComponent>);

  close(mode?: LoteDeactivationMode): void {
    this.ref.close(mode);
  }
}
