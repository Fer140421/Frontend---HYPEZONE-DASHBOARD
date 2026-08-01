import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
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
import { cloudinaryDetailUrl, cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
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
    EmptyStateComponent,
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
  readonly columns = ['imagen', 'nombre', 'talla', 'precioVenta', 'estado', 'acciones'];
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly mode = signal<'list' | 'new' | 'detail'>('list');
  readonly currentId = signal<string | null>(null);
  readonly currentProducto = signal<Producto | null>(null);
  readonly imagenes = signal<string[]>([]);
  readonly procesandoVenta = signal(false);

  readonly lotes$ = this.loteRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly filters = this.fb.nonNullable.group({
    search: [''],
    categoria: [''],
    talla: [''],
    estado: ['disponible'],
    loteId: [''],
  });

  readonly productosFiltrados$ = combineLatest([
    this.productosSource$,
    this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())),
  ]).pipe(
    map(([productos, filters]) => {
      const search = (filters.search ?? '').toLowerCase().trim();
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
  readonly listViewModel$ = combineLatest({
    categorias: this.categorias$,
    lotes: this.lotes$,
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
    precioOferta: this.fb.control<number | null>(null),
    estado: ['disponible', Validators.required],
    codigo: [''],
    notas: [''],
  });

  readonly ventaForm = this.fb.nonNullable.group({
    precioVenta: [0, [Validators.required, Validators.min(0)]],
    metodoPago: ['efectivo', Validators.required],
    clienteNombre: [''],
    clienteTelefono: [''],
    notas: [''],
  });

  ngOnInit(): void {
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
              precioOferta: null,
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
          precioOferta: producto.precioOferta ?? null,
          estado: producto.estado,
          codigo: producto.codigo || generateProductCode(),
          notas: producto.notas ?? '',
        });
        this.imagenes.set(imagenesProducto(producto));
        this.ventaForm.patchValue({ precioVenta: Number(producto.precioOferta ?? precioProducto(producto)) });
      });
  }

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  precioCompra(producto: Producto): number {
    return precioCompraProducto(producto);
  }

  firstImage(producto: Producto): string {
    return cloudinaryThumbnailUrl(imagenesProducto(producto)[0] ?? '');
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  openView(producto: Producto): void {
    this.dialog.open(ProductViewDialogComponent, {
      width: 'min(760px, 96vw)',
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
    const { precioOferta, ...productValues } = raw;
    const payload: Partial<Producto> = {
      ...productValues,
      loteId: raw.loteId || undefined,
      genero: (raw.genero || undefined) as GeneroProducto | undefined,
      codigo: raw.codigo || generateProductCode(),
      ...(precioOferta === null ? {} : { precioOferta }),
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
    if (!this.auth.can('products.delete')) return;
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
        ...raw,
        fechaVenta: new Date().toISOString(),
        metodoPago: raw.metodoPago as never,
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
  imports: [CurrencyPipe, MatButtonModule, MatDialogModule, StatusChipComponent],
  templateUrl: './product-view-dialog.html',
  styleUrl: './product-view-dialog.css',
})
export class ProductViewDialogComponent {
  readonly data = inject<ProductViewDialogData>(MAT_DIALOG_DATA);
  readonly imagenes = imagenesProducto(this.data.producto).map((image, index) =>
    index === 0 ? cloudinaryDetailUrl(image) : cloudinaryThumbnailUrl(image),
  );
  readonly precioVenta = precioProducto(this.data.producto);
  readonly precioCompra = precioCompraProducto(this.data.producto);
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
    precioOferta: this.fb.control<number | null>(this.data.producto.precioOferta ?? null),
    estado: [this.data.producto.estado, Validators.required],
    codigo: [this.data.producto.codigo || generateProductCode()],
    notas: [this.data.producto.notas ?? ''],
  });

  save(): void {
    const raw = this.form.getRawValue();
    const { precioOferta, ...productValues } = raw;
    this.dialogRef.close({
      ...productValues,
      loteId: raw.loteId || undefined,
      genero: (raw.genero || undefined) as GeneroProducto | undefined,
      ...(precioOferta === null ? {} : { precioOferta }),
      imagenes: this.imagenes(),
      activo: true,
    } satisfies Partial<Producto>);
  }
}

