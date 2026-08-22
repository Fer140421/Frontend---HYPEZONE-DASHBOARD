import { AsyncPipe, CurrencyPipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, BehaviorSubject, combineLatest, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { Lote } from '../../../core/models/lote.model';
import {
  CategoriaProducto,
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
import { metodosPago } from '../../../core/models/venta.model';
import { LoteRepository } from '../../../core/repositories/lote.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { CategoriaRepository } from '../../../core/repositories/categoria.repository';
import { MarcaRepository } from '../../../core/repositories/marca.repository';
import { TallaRepository } from '../../../core/repositories/talla.repository';
import { VentaService } from '../../../core/services/venta.service';
import { AuthService } from '../../../core/services/auth.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { cloudinaryDetailUrl, cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { formatInternationalPhone, SOUTH_AMERICAN_COUNTRIES } from '../../../core/utils/phone.util';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterDrawerComponent } from '../../../shared/components/filter-drawer/filter-drawer.component';
import { ImageUploaderComponent } from '../../../shared/components/image-uploader/image-uploader.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    EmptyStateComponent,
    FilterDrawerComponent,
    ImageUploaderComponent,
    LoadingComponent,
    PageHeaderComponent,
    StatusChipComponent,
  ],
  templateUrl: './productos.html',
  styleUrl: './productos.css',
})
export class ProductosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly productoRepository = inject(ProductoRepository);
  private readonly loteRepository = inject(LoteRepository);
  private readonly ventaService = inject(VentaService);
  private readonly categoriaRepository = inject(CategoriaRepository);
  private readonly marcaRepository = inject(MarcaRepository);
  private readonly tallaRepository = inject(TallaRepository);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // Una fuente compartida por colección durante la vida de esta vista.
  private readonly productosSource$ = this.productoRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly categorias$ = this.categoriaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly marcas$ = this.marcaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly tallas$ = this.tallaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly estados = estadosProducto;
  readonly generos = generosProducto;
  readonly metodos = metodosPago;
  readonly countries = SOUTH_AMERICAN_COUNTRIES;
  readonly columns = ['imagen', 'nombre', 'talla', 'precioVenta', 'estado', 'publicacion', 'acciones'];
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly mode = signal<'list' | 'new' | 'detail'>('list');
  readonly viewType = inject(ViewPreferenceService).getViewSignal('productos', 'table');
  readonly currentId = signal<string | null>(null);
  readonly currentProducto = signal<Producto | null>(null);
  readonly filtersOpen = signal(false);
  readonly imagenes = signal<string[]>([]);
  readonly procesandoVenta = signal(false);

  private readonly lotesSource$ = this.loteRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly lotes$ = this.lotesSource$;
  readonly filters = this.fb.nonNullable.group({
    search: [''],
    categoria: [''],
    talla: [''],
    estado: ['disponible'],
    loteId: [''],
  });
  private readonly appliedFilters$ = new BehaviorSubject({
    categoria: '',
    talla: '',
    estado: 'disponible',
    loteId: '',
  });

  readonly productosFiltrados$ = combineLatest([
    this.productosSource$,
    this.filters.controls.search.valueChanges.pipe(startWith(this.filters.controls.search.getRawValue())),
    this.appliedFilters$,
  ]).pipe(
    map(([productos, searchValue, filters]) => {
      const search = searchValue.toLowerCase().trim();
      return productos.filter((producto) => {
        const matchesSearch =
          !search ||
          producto.nombre.toLowerCase().includes(search) ||
          (producto.marca ?? '').toLowerCase().includes(search);
        return (
          matchesSearch &&
          (!filters.categoria || producto.categoria === filters.categoria) &&
          (!filters.talla || producto.talla === filters.talla) &&
          (!filters.estado || producto.estado === filters.estado) &&
          (!filters.loteId || producto.loteId === filters.loteId)
        );
      });
    }),
  );
  readonly lotesParaFiltro$ = combineLatest([
    this.lotesSource$,
    this.productosSource$,
    this.appliedFilters$,
  ]).pipe(
    map(([lotes, productos, filters]) => {
      const estado = filters.estado;
      if (!estado) {
        return lotes;
      }

      const lotesConEstado = new Set(
        productos
          .filter((producto) => producto.estado === estado && !!producto.loteId)
          .map((producto) => producto.loteId!),
      );
      return lotes.filter((lote) => !!lote.id && lotesConEstado.has(lote.id));
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly listViewModel$ = combineLatest({
    categorias: this.categorias$,
    lotes: this.lotesParaFiltro$,
    tallas: this.tallas$,
    productos: this.productosFiltrados$,
    pagination: this.pagination$,
  }).pipe(
    map(({ categorias, lotes, tallas, productos, pagination }) => ({
      categorias,
      lotes,
      tallas,
      productos: paginateItems(productos, pagination),
    })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly formOptions$ = combineLatest({
    categorias: this.categorias$,
    marcas: this.marcas$,
    tallas: this.tallas$,
    lotes: this.lotes$,
  }).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  readonly colores = coloresProducto;

  readonly form = this.fb.nonNullable.group({
    loteId: [''],
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
    codigo: [''],
    notas: [''],
  });

  readonly ventaForm = this.fb.nonNullable.group({
    precioVenta: [0, [Validators.required, Validators.min(0)]],
    metodoPago: ['efectivo', Validators.required],
    clienteNombre: [''],
    codigoPais: ['591'],
    clienteTelefono: [''],
    notas: [''],
  });

  ngOnInit(): void {
    this.filters.controls.search.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetListPage());

    this.filters.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.filters.controls.loteId.getRawValue()) {
          this.filters.controls.loteId.setValue('');
        }
      });

    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((segments) => {
      const isNew = segments.some((segment) => segment.path === 'nuevo');
      this.mode.set(isNew ? 'new' : this.route.snapshot.paramMap.has('id') ? 'detail' : 'list');
    });

    this.route.paramMap
      .pipe(
        switchMap((params) => (params.get('id') ? this.productoRepository.getById(params.get('id')!) : of(null))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((producto) => {
        this.currentProducto.set(producto ?? null);
        this.currentId.set(producto?.id ?? null);

        if (!producto) {
          if (this.mode() === 'new') {
            this.form.reset({
              loteId: this.route.snapshot.queryParamMap.get('loteId') ?? '',
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
              notas: '',
            });
            this.imagenes.set([]);
          }
          return;
        }

        this.form.patchValue({
          loteId: producto.loteId ?? '',
          nombre: producto.nombre,
          marca: producto.marca ?? '',
          categoria: producto.categoria ?? 'otro',
          descripcion: producto.descripcion,
          talla: producto.talla,
          color: producto.color ?? '',
          genero: producto.genero ?? '',
          precioCompra: precioCompraProducto(producto),
          precioVenta: precioProducto(producto),
          estado: producto.estado,
          codigo: producto.codigo || generateProductCode(),
          notas: producto.notas ?? '',
        });
        this.imagenes.set(imagenesProducto(producto));
        const oferta = Number(producto.precioOferta);
        const precioBase = precioProducto(producto);
        this.ventaForm.patchValue({
          precioVenta: Number.isFinite(oferta) && oferta > 0 && oferta < precioBase ? oferta : precioBase,
        });
      });
  }

  openFilters(): void {
    this.filters.patchValue(this.appliedFilters$.value, { emitEvent: false });
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    const { categoria, talla, estado, loteId } = this.filters.getRawValue();
    this.appliedFilters$.next({ categoria, talla, estado, loteId });
    this.resetListPage();
  }

  private resetListPage(): void {
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  precioCompra(producto: Producto): number {
    return precioCompraProducto(producto);
  }

  tieneOferta(producto: Producto): boolean {
    const oferta = Number(producto.precioOferta);
    return Number.isFinite(oferta) && oferta > 0 && oferta < this.precio(producto);
  }

  firstImage(producto: Producto): string {
    return cloudinaryThumbnailUrl(imagenesProducto(producto)[0] ?? '');
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  openView(producto: Producto): void {
    this.dialog.open(ProductViewDialogComponent, {
      width: 'min(920px, 95vw)',
      maxWidth: '920px',
      maxHeight: '92vh',
      data: {
        producto,
      },
    });
  }

  openEdit(producto: Producto): void {
    if (!this.auth.can('products.update')) return;
    if (!producto.id) {
      return;
    }

    const dialogRef = this.dialog.open(ProductEditDialogComponent, {
      width: 'min(920px, 96vw)',
      maxHeight: '92vh',
      data: {
        producto,
        lotes$: this.lotes$,
      },
    });

    dialogRef.afterClosed().subscribe(async (payload?: Partial<Producto>) => {
      if (!payload || !producto.id) {
        return;
      }
      await this.productoRepository.update(producto.id, payload);
      this.snack('Producto actualizado.');
    });
  }

  async save(): Promise<void> {
    if (!this.auth.can('products.create') && !this.auth.can('products.update')) return;
    const raw = this.form.getRawValue();
    const payload: Partial<Producto> = {
      ...raw,
      loteId: raw.loteId || undefined,
      genero: (raw.genero || undefined) as GeneroProducto | undefined,
      codigo: raw.codigo || generateProductCode(),
      imagenes: this.imagenes(),
      activo: true,
    } as Partial<Producto>;

    if (this.currentId()) {
      await this.productoRepository.update(this.currentId()!, payload);
      this.snack('Producto actualizado.');
      await this.router.navigate(['/dashboard/productos']);
      return;
    }

    await this.productoRepository.create(payload);
    this.snack('Producto creado.');
    await this.router.navigate(['/dashboard/productos']);
  }

  async publicarEnWeb(producto: Producto): Promise<void> {
    if (!this.auth.can('products.update') || !producto.id || producto.estadoPublicacion === 'publicado') return;
    try {
      await this.productoRepository.publicarEnWeb(producto.id);
      this.snack('Producto publicado en la web.');
    } catch (error) {
      this.snack(error instanceof Error ? error.message : 'No se pudo publicar el producto.');
    }
  }

  openPriceEdit(producto: Producto): void {
    if (!this.auth.can('products.update')) return;
    if (!producto.id) {
      return;
    }

    const dialogRef = this.dialog.open(ProductPriceDialogComponent, {
      width: 'min(420px, 92vw)',
      data: {
        producto,
      },
    });

    dialogRef.afterClosed().subscribe(async (precioVenta: unknown) => {
      if (typeof precioVenta !== 'number' || !Number.isFinite(precioVenta) || !producto.id) {
        return;
      }
      await this.productoRepository.cambiarPrecio(producto.id, precioVenta);
      this.snack('Precio actualizado.');
    });
  }

  softDelete(producto: Producto): void {
    if (!this.auth.can('products.delete') || producto.activo === false) return;
    if (producto.estado !== 'disponible') {
      this.snack('Los productos vendidos o reservados no se pueden eliminar.');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar producto',
        message: `Se ocultara "${producto.nombre}" sin borrarlo fisicamente.`,
        confirmText: 'Eliminar',
      },
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed && producto.id) {
        await this.productoRepository.delete(producto.id);
        this.snack('Producto eliminado logicamente.');
      }
    });
  }

  async restore(producto: Producto): Promise<void> {
    if (!this.auth.can('products.delete')) return;
    if (!producto.id) {
      return;
    }
    await this.productoRepository.activate(producto.id);
    this.snack('Producto restaurado.');
  }

  confirmRestore(producto: Producto): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Restaurar producto',
        message: `El producto "${producto.nombre}" volvera a aparecer como activo.`,
        confirmText: 'Restaurar',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        void this.restore(producto);
      }
    });
  }

  async registrarVenta(): Promise<void> {
    const producto = this.currentProducto();
    if (!producto || this.ventaForm.invalid || this.procesandoVenta()) {
      return;
    }

    const raw = this.ventaForm.getRawValue();
    this.procesandoVenta.set(true);
    try {
      await this.ventaService.registrarVenta(producto, {
        precioVenta: raw.precioVenta,
        metodoPago: raw.metodoPago as never,
        clienteNombre: raw.clienteNombre || undefined,
        clienteTelefono: formatInternationalPhone(raw.codigoPais, raw.clienteTelefono) || undefined,
        notas: raw.notas || undefined,
        fechaVenta: new Date().toISOString(),
      });
      this.snack('Venta registrada correctamente.');
      await this.router.navigate(['/dashboard/ventas']);
    } catch (error) {
      this.snack(this.ventaErrorMessage(error));
    } finally {
      this.procesandoVenta.set(false);
    }
  }

  private ventaErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo registrar la venta.';
  }

  snack(message: string): void {
    this.snackBar.open(message, 'OK', { duration: 2500 });
  }
}

interface ProductEditDialogData {
  producto: Producto;
  lotes$: Observable<Lote[]>;
}

interface ProductViewDialogData {
  producto: Producto;
}

interface ProductPriceDialogData {
  producto: Producto;
}

@Component({
  selector: 'app-product-view-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    TitleCasePipe,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    StatusChipComponent,
  ],
  templateUrl: './product-view-dialog.html',
  styleUrl: './product-view-dialog.css',
})
export class ProductViewDialogComponent {
  readonly data = inject<ProductViewDialogData>(MAT_DIALOG_DATA);
  readonly rawImages = imagenesProducto(this.data.producto);
  readonly selectedIndex = signal<number>(0);

  readonly mainImage = computed(() => {
    if (!this.rawImages.length) return null;
    const idx = Math.min(Math.max(0, this.selectedIndex()), this.rawImages.length - 1);
    return cloudinaryDetailUrl(this.rawImages[idx]);
  });

  readonly thumbnails = this.rawImages.map((img) => cloudinaryThumbnailUrl(img));
  readonly precioVenta = precioProducto(this.data.producto);
  readonly precioCompra = precioCompraProducto(this.data.producto);
  readonly margenBs = this.precioVenta - this.precioCompra;
  readonly margenPorcentaje =
    this.precioCompra > 0 ? ((this.precioVenta - this.precioCompra) / this.precioCompra) * 100 : 0;

  readonly colorHex = computed(() => {
    const colorName = this.data.producto.color;
    if (!colorName) return null;
    const name = colorName.toLowerCase().trim();
    const colorMap: Record<string, string> = {
      negro: '#18181b',
      blanco: '#ffffff',
      gris: '#6b7280',
      plomo: '#4b5563',
      rojo: '#ef4444',
      azul: '#2563eb',
      'azul marino': '#1e3a8a',
      verde: '#10b981',
      'verde olivo': '#556b2f',
      amarillo: '#eab308',
      naranja: '#f97316',
      rosado: '#ec4899',
      rosa: '#ec4899',
      morado: '#8b5cf6',
      beige: '#f5f5dc',
      marrón: '#78350f',
      marron: '#78350f',
      celeste: '#38bdf8',
    };
    return colorMap[name] ?? null;
  });

  selectImage(index: number): void {
    if (index >= 0 && index < this.rawImages.length) {
      this.selectedIndex.set(index);
    }
  }

  prevImage(): void {
    if (this.rawImages.length <= 1) return;
    const current = this.selectedIndex();
    const prev = current === 0 ? this.rawImages.length - 1 : current - 1;
    this.selectedIndex.set(prev);
  }

  nextImage(): void {
    if (this.rawImages.length <= 1) return;
    const current = this.selectedIndex();
    const next = current === this.rawImages.length - 1 ? 0 : current + 1;
    this.selectedIndex.set(next);
  }
}

@Component({
  selector: 'app-product-price-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './product-price-dialog.html',
  styleUrl: './product-price-dialog.css',
})
export class ProductPriceDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ProductPriceDialogComponent>);
  readonly data = inject<ProductPriceDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    precioVenta: [precioProducto(this.data.producto), [Validators.required, Validators.min(0)]],
  });

  save(): void {
    if (this.form.invalid) {
      return;
    }

    this.dialogRef.close(Number(this.form.getRawValue().precioVenta));
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

@Component({
  selector: 'app-product-edit-dialog',
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
  templateUrl: './product-edit-dialog.html',
  styleUrl: './product-edit-dialog.css',
})
export class ProductEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<ProductEditDialogComponent>);
  private readonly categoriaRepository = inject(CategoriaRepository);
  private readonly marcaRepository = inject(MarcaRepository);
  private readonly tallaRepository = inject(TallaRepository);
  readonly data = inject<ProductEditDialogData>(MAT_DIALOG_DATA);

  readonly categorias$ = this.categoriaRepository.getAll().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly marcas$ = this.marcaRepository.getAll().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly tallas$ = this.tallaRepository.getAll().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly estados = estadosProducto;
  readonly generos = generosProducto;
  readonly colores = coloresProducto;
  readonly imagenes = signal(imagenesProducto(this.data.producto));

  readonly form = this.fb.nonNullable.group({
    loteId: [this.data.producto.loteId ?? ''],
    nombre: [this.data.producto.nombre, Validators.required],
    marca: [this.data.producto.marca ?? ''],
    categoria: [this.data.producto.categoria ?? 'otro', Validators.required],
    descripcion: [this.data.producto.descripcion, Validators.required],
    talla: [this.data.producto.talla, Validators.required],
    color: [this.data.producto.color ?? ''],
    genero: [this.data.producto.genero ?? ''],
    precioCompra: [precioCompraProducto(this.data.producto), [Validators.required, Validators.min(0)]],
    precioVenta: [precioProducto(this.data.producto), [Validators.required, Validators.min(0)]],
    estado: [this.data.producto.estado, Validators.required],
    codigo: [this.data.producto.codigo || generateProductCode()],
    notas: [this.data.producto.notas ?? ''],
  });

  save(): void {
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      ...raw,
      loteId: raw.loteId || undefined,
      genero: (raw.genero || undefined) as GeneroProducto | undefined,
      imagenes: this.imagenes(),
      activo: true,
    } satisfies Partial<Producto>);
  }
}

