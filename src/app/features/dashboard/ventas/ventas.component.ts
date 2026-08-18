import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, startWith, take } from 'rxjs';
import { Cliente } from '../../../core/models/cliente.model';
import { Producto, imagenesProducto, precioProducto } from '../../../core/models/producto.model';
import { MetodoPago, Venta, metodosPago } from '../../../core/models/venta.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { VentaRepository } from '../../../core/repositories/venta.repository';
import { VentaService } from '../../../core/services/venta.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  cloudinaryCardUrl,
  cloudinaryPreviewUrl,
  cloudinaryThumbnailUrl,
} from '../../../core/utils/cloudinary-image.util';
import { whatsappUrl } from '../../../core/utils/phone.util';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
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
import {
  ClienteFormDialogComponent,
  ClienteFormDialogData,
} from '../clientes/clientes.component';

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
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
  ],
  templateUrl: './ventas.html',
  styleUrl: './ventas.css',
})
export class VentasComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly clienteRepository = inject(ClienteRepository);
  private readonly productoRepository = inject(ProductoRepository);
  private readonly ventaRepository = inject(VentaRepository);
  private readonly ventaService = inject(VentaService);
  readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly metodos = metodosPago;
  readonly columns = ['nombreProducto', 'operacion', 'fechaVenta', 'precioVenta', 'ganancia', 'metodoPago', 'acciones'];
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly mode = signal<'list' | 'new' | 'edit'>('list');
  readonly viewType = inject(ViewPreferenceService).getViewSignal('ventas', 'table');
  readonly filtersOpen = signal(false);
  readonly procesandoVenta = signal(false);
  readonly buscandoCliente = signal(false);
  readonly searchControl = this.fb.nonNullable.control('');
  readonly clienteSearchControl = this.fb.nonNullable.control('');
  readonly selectedCliente = signal<Cliente | null>(null);
  readonly clienteResultados = signal<Cliente[]>([]);
  readonly clienteBusquedaRealizada = signal(false);

  private productosDisponibles: Producto[] = [];
  private ventasActuales: Venta[] = [];
  private editOriginalDetails: Venta[] = [];
  private readonly selected = new Map<string, Producto>();

  private readonly productosSource$ = this.productoRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly clientesSource$ = this.clienteRepository.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  private readonly ventasSource$ = this.ventaRepository.getAll().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly catalogo$ = combineLatest([
    this.productosSource$,
    this.searchControl.valueChanges.pipe(startWith('')),
  ]).pipe(
    map(([allProducts, search]) => {
      const productos = allProducts.filter(
        (producto) =>
          producto.activo !== false &&
          (producto.estado === 'disponible' ||
            (!!producto.id &&
              (this.selected.has(producto.id) ||
                this.editOriginalDetails.some((item) => item.productoId === producto.id)))),
      );
      this.productosDisponibles = allProducts;
      const term = search.toLowerCase().trim();
      return productos.filter(
        (producto) =>
          !term ||
          [producto.nombre, producto.marca, producto.codigo, producto.categoria].some((value) =>
            (value ?? '').toLowerCase().includes(term),
          ),
      );
    }),
  );

  readonly saleForm = this.fb.nonNullable.group({
    detalles: this.fb.array([] as ReturnType<VentasComponent['createDetailGroup']>[]),
    metodoPago: ['efectivo', Validators.required],
    fechaVenta: [new Date(), Validators.required],
    clienteId: [''],
    clienteNombre: [''],
    clienteTelefono: [''],
    clienteCi: [''],
    notas: [''],
  });

  readonly filters = this.fb.nonNullable.group({
    producto: [''],
    metodoPago: [''],
    desde: [null as Date | null],
    hasta: [null as Date | null],
  });
  private readonly appliedFilters$ = new BehaviorSubject({
    metodoPago: '',
    desde: null as Date | null,
    hasta: null as Date | null,
  });

  readonly ventasFiltradas$ = combineLatest([
    this.ventasSource$,
    this.filters.controls.producto.valueChanges.pipe(startWith(this.filters.controls.producto.getRawValue())),
    this.appliedFilters$,
  ]).pipe(
    map(([ventas, productoValue, filters]) => {
      this.ventasActuales = ventas;
      const producto = productoValue.toLowerCase().trim();
      const desde = filters.desde
        ? new Date(filters.desde).setHours(0, 0, 0, 0)
        : 0;
      const hasta = filters.hasta
        ? new Date(filters.hasta).setHours(23, 59, 59, 999)
        : Number.POSITIVE_INFINITY;
      return ventas.filter(
        (venta) =>
          (!producto || venta.nombreProducto.toLowerCase().includes(producto)) &&
          (!filters.metodoPago || venta.metodoPago === filters.metodoPago) &&
          new Date(venta.fechaVenta).getTime() >= desde &&
          new Date(venta.fechaVenta).getTime() <= hasta,
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly summary$ = this.ventasFiltradas$.pipe(
    map((ventas) => ({
      totalVentas: ventas.length,
      totalVendido: ventas.reduce((total, venta) => total + Number(venta.precioVenta), 0),
      ganancia: ventas.reduce((total, venta) => total + Number(venta.ganancia), 0),
    })),
  );

  readonly listViewModel$ = combineLatest({
    ventas: this.ventasFiltradas$,
    summary: this.summary$,
    pagination: this.pagination$,
  }).pipe(
    map(({ ventas, summary, pagination }) => ({
      summary,
      ventas: paginateItems(ventas, pagination),
    })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  get detalles(): FormArray {
    return this.saleForm.controls.detalles;
  }

  get total(): number {
    return this.detalles.controls.reduce(
      (sum, control) => sum + Number(control.get('precioFinal')?.value ?? 0),
      0,
    );
  }

  ngOnInit(): void {
    this.filters.controls.producto.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetListPage());

    this.route.url
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((segments) =>
        this.mode.set(
          segments.some((segment) => segment.path === 'nueva')
            ? 'new'
            : segments.some((segment) => segment.path === 'editar')
              ? 'edit'
              : 'list',
        ),
      );

    combineLatest([this.route.paramMap, this.productosSource$, this.ventasSource$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, productos, ventas]) => {
        this.productosDisponibles = productos;
        if (this.mode() !== 'edit' || this.editOriginalDetails.length) {
          return;
        }

        const id = params.get('id');
        if (!id) {
          return;
        }

        const detalles = ventas.filter(
          (item) => item.operacionId === id || (!item.operacionId && item.id === id),
        );
        if (!detalles.length) {
          return;
        }

        this.editOriginalDetails = detalles;
        const first = detalles[0];
        this.saleForm.patchValue({
          metodoPago: first.metodoPago ?? 'efectivo',
          fechaVenta: new Date(first.fechaVenta),
          clienteId: first.clienteId ?? '',
          clienteNombre: first.clienteNombre ?? '',
          clienteTelefono: first.clienteTelefono ?? '',
          clienteCi: first.clienteCi ?? '',
          notas: first.notas ?? '',
        });

        detalles.forEach((detalle) => {
          const producto = productos.find((item) => item.id === detalle.productoId);
          if (!producto?.id) {
            return;
          }
          this.selected.set(producto.id, producto);
          const group = this.createDetailGroup(producto);
          group.patchValue({ precioFinal: Number(detalle.precioVenta) });
          this.detalles.push(group);
        });

        this.searchControl.setValue(this.searchControl.value);
      });

    this.clientesSource$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((clientes) => {
      const clienteId = this.saleForm.controls.clienteId.getRawValue();
      if (!clienteId) {
        return;
      }
      const cliente = clientes.find((item) => item.id === clienteId);
      if (cliente) {
        this.applyCliente(cliente);
      }
      });
  }

  openFilters(): void {
    this.filters.patchValue(this.appliedFilters$.value, { emitEvent: false });
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    const { metodoPago, desde, hasta } = this.filters.getRawValue();
    this.appliedFilters$.next({ metodoPago, desde, hasta });
    this.resetListPage();
  }

  private resetListPage(): void {
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  effectivePrice(producto: Producto): number {
    const offer = Number(producto.precioOferta);
    return producto.precioOferta !== undefined &&
      Number.isFinite(offer) &&
      offer > 0 &&
      offer < this.precio(producto)
      ? offer
      : this.precio(producto);
  }

  hasOffer(producto: Producto): boolean {
    return this.effectivePrice(producto) < this.precio(producto);
  }

  image(producto: Producto): string {
    return cloudinaryCardUrl(imagenesProducto(producto)[0] ?? '');
  }

  isSelected(producto: Producto): boolean {
    return !!producto.id && this.selected.has(producto.id);
  }

  selectedImage(id: string): string {
    return cloudinaryPreviewUrl(imagenesProducto(this.selected.get(id)!)[0] ?? '');
  }

  selectedSubtitle(id: string): string {
    const producto = this.selected.get(id);
    return producto
      ? [producto.marca, producto.talla && `Talla ${producto.talla}`].filter(Boolean).join(' · ')
      : '';
  }

  whatsappLink(celular: string | undefined): string | null {
    return whatsappUrl(celular);
  }

  clienteOptionLabel(cliente: Cliente): string {
    return [cliente.nombreCompleto, cliente.ci && `CI ${cliente.ci}`].filter(Boolean).join(' · ');
  }

  addProduct(producto: Producto): void {
    if (!producto.id || this.selected.has(producto.id)) {
      return;
    }
    this.selected.set(producto.id, producto);
    this.detalles.push(this.createDetailGroup(producto));
  }

  removeProduct(index: number): void {
    const id = this.detalles.at(index).get('productoId')?.value;
    this.detalles.removeAt(index);
    if (id) {
      this.selected.delete(id);
    }
  }

  selectCliente(cliente: Cliente): void {
    this.applyCliente(cliente);
    this.clienteResultados.set([]);
    this.clienteBusquedaRealizada.set(false);
  }

  clearCliente(): void {
    this.selectedCliente.set(null);
    this.clienteResultados.set([]);
    this.clienteBusquedaRealizada.set(false);
    this.clienteSearchControl.setValue('');
    this.saleForm.patchValue({
      clienteId: '',
      clienteNombre: '',
      clienteTelefono: '',
      clienteCi: '',
    });
  }

  async buscarCliente(): Promise<void> {
    const term = this.normalizeSearch(this.clienteSearchControl.getRawValue());
    if (!term || this.buscandoCliente()) {
      if (!term) {
        this.snackBar.open('Escribe un nombre, CI o celular para buscar.', 'OK', { duration: 2800 });
      }
      return;
    }

    this.buscandoCliente.set(true);
    this.selectedCliente.set(null);
    this.saleForm.patchValue({ clienteId: '', clienteNombre: '', clienteTelefono: '', clienteCi: '' });
    try {
      const clientes = await firstValueFrom(this.clientesSource$.pipe(take(1)));
      const resultados = clientes.filter((cliente) =>
        cliente.activo !== false &&
        [cliente.nombreCompleto, cliente.ci, cliente.celular]
          .map((value) => this.normalizeSearch(value ?? ''))
          .some((value) => value.includes(term)),
      );
      this.clienteBusquedaRealizada.set(true);

      if (resultados.length === 1) {
        this.selectCliente(resultados[0]);
        this.snackBar.open('Cliente encontrado y seleccionado.', 'OK', { duration: 2200 });
      } else {
        this.clienteResultados.set(resultados);
        this.snackBar.open(
          resultados.length ? 'Selecciona el cliente correcto.' : 'No se encontró el cliente. Puedes registrarlo.',
          'OK',
          { duration: 3000 },
        );
      }
    } finally {
      this.buscandoCliente.set(false);
    }
  }

  async openClientDialog(): Promise<void> {
    if (!this.auth.can('clients.create')) return;
    const result = await firstValueFrom(
      this.dialog
        .open(ClienteFormDialogComponent, {
          width: 'min(560px, 96vw)',
          maxHeight: '90vh',
          data: { deferred: true } satisfies ClienteFormDialogData,
        })
        .afterClosed(),
    );
    if (!result) {
      return;
    }

    this.applyCliente(result as Cliente);
    this.snackBar.open('Cliente preparado. Se guardará al confirmar la venta.', 'OK', { duration: 3200 });
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  viewSale(venta: Venta): void {
    this.dialog.open(VentaViewDialogComponent, {
      width: 'min(860px,96vw)',
      maxHeight: '92vh',
      data: { detalles: this.operationDetails(venta), productos: this.productosDisponibles },
    });
  }

  editSale(venta: Venta): void {
    if (!this.auth.can('sales.update')) return;
    void this.router.navigate(['/dashboard/ventas', venta.operacionId ?? venta.id, 'editar']);
  }

  async registrarVenta(): Promise<void> {
    if (this.saleForm.invalid || !this.detalles.length || this.procesandoVenta() || (this.mode() === 'edit' ? !this.auth.can('sales.update') : !this.auth.can('sales.create'))) {
      return;
    }

    this.procesandoVenta.set(true);
    try {
      const raw = this.saleForm.getRawValue();
      const detalles = raw.detalles.map((detalle) => ({
        producto: this.selected.get(detalle.productoId)!,
        precioVenta: Number(detalle.precioFinal),
      }));
      const input = {
        metodoPago: raw.metodoPago as MetodoPago,
        fechaVenta: raw.fechaVenta.toISOString(),
        clienteId: raw.clienteId || undefined,
        clienteNombre: raw.clienteNombre || undefined,
        clienteTelefono: raw.clienteTelefono || undefined,
        clienteCi: raw.clienteCi || undefined,
        clienteNuevo: this.selectedCliente()?.id
          ? undefined
          : this.selectedCliente()
            ? {
                nombreCompleto: this.selectedCliente()!.nombreCompleto,
                celular: this.selectedCliente()!.celular,
                ci: this.selectedCliente()!.ci,
              }
            : undefined,
        notas: raw.notas,
      };

      if (this.mode() === 'edit') {
        await this.ventaService.editarVentaCompleta(this.editOriginalDetails, detalles, input);
      } else {
        await this.ventaService.registrarVentaMultiple(detalles, input);
      }

      this.snackBar.open(
        this.mode() === 'edit'
          ? 'Venta actualizada correctamente.'
          : `Venta registrada: ${raw.detalles.length} producto(s) por Bs ${this.total.toFixed(2)}.`,
        'OK',
        { duration: 3500 },
      );
      await this.router.navigate(['/dashboard/ventas']);
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'No se pudo guardar la venta.',
        'OK',
        { duration: 4000 },
      );
    } finally {
      this.procesandoVenta.set(false);
    }
  }

  private operationDetails(venta: Venta): Venta[] {
    return venta.operacionId
      ? this.ventasActuales.filter((item) => item.operacionId === venta.operacionId)
      : [venta];
  }

  private createDetailGroup(producto: Producto) {
    return this.fb.nonNullable.group({
      productoId: [producto.id!],
      nombre: [producto.nombre],
      precioOriginal: [this.precio(producto)],
      precioBase: [this.effectivePrice(producto)],
      precioFinal: [this.effectivePrice(producto), [Validators.required, Validators.min(0)]],
    });
  }

  private applyCliente(cliente: Cliente): void {
    this.selectedCliente.set(cliente);
    this.clienteResultados.set([]);
    this.clienteSearchControl.setValue(cliente.nombreCompleto, { emitEvent: false });
    this.saleForm.patchValue({
      clienteId: cliente.id ?? '',
      clienteNombre: cliente.nombreCompleto,
      clienteTelefono: cliente.celular,
      clienteCi: cliente.ci ?? '',
    });
  }

  private normalizeSearch(value: string): string {
    return value
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}

interface VentaDialogData {
  detalles: Venta[];
  productos: Producto[];
}

interface VentaEditResult {
  precios: Record<string, number>;
  metodoPago: MetodoPago;
  fechaVenta: string;
  clienteId?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteCi?: string;
  notas?: string;
}

@Component({
  selector: 'app-venta-view-dialog',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './venta-view-dialog.html',
  styleUrl: './venta-view-dialog.css',
})
export class VentaViewDialogComponent {
  readonly data = inject<VentaDialogData>(MAT_DIALOG_DATA);
  readonly first = this.data.detalles[0];
  readonly total = this.data.detalles.reduce((sum, item) => sum + Number(item.precioVenta), 0);
  readonly operationLabel = this.first.operacionId
    ? `Venta #${this.first.operacionId.slice(0, 6).toUpperCase()}`
    : 'Venta individual';

  product(detalle: Venta): Producto | undefined {
    return this.data.productos.find((item) => item.id === detalle.productoId);
  }

  productImage(detalle: Venta): string {
    const producto = this.product(detalle);
    return producto ? cloudinaryThumbnailUrl(imagenesProducto(producto)[0] ?? '') : '';
  }

  productMeta(detalle: Venta): string {
    const producto = this.product(detalle);
    return producto
      ? [producto.marca, producto.categoria, producto.talla && `Talla ${producto.talla}`, producto.color]
          .filter(Boolean)
          .join(' · ')
      : 'Producto vendido';
  }
}

@Component({
  selector: 'app-venta-edit-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './venta-edit-dialog.html',
  styleUrl: './venta-edit-dialog.css',
})
export class VentaEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<VentaEditDialogComponent>);
  readonly data = inject<VentaDialogData>(MAT_DIALOG_DATA);
  readonly metodos = metodosPago;
  readonly first = this.data.detalles[0];
  readonly form = this.fb.nonNullable.group({
    precios: this.fb.array(
      this.data.detalles.map((item) =>
        this.fb.nonNullable.group({
          precio: [Number(item.precioVenta), [Validators.required, Validators.min(0)]],
        }),
      ),
    ),
    metodoPago: [this.first.metodoPago ?? 'efectivo', Validators.required],
    fechaVenta: [new Date(this.first.fechaVenta), Validators.required],
    clienteId: [this.first.clienteId ?? ''],
    clienteNombre: [this.first.clienteNombre ?? ''],
    clienteTelefono: [this.first.clienteTelefono ?? ''],
    clienteCi: [this.first.clienteCi ?? ''],
    notas: [this.first.notas ?? ''],
  });

  get precios(): FormArray {
    return this.form.controls.precios;
  }

  get total(): number {
    return this.precios.controls.reduce((sum, item) => sum + Number(item.get('precio')?.value ?? 0), 0);
  }

  close(): void {
    this.ref.close();
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }

    const raw = this.form.getRawValue();
    const precios: Record<string, number> = {};
    this.data.detalles.forEach((item, index) => {
      if (item.id) {
        precios[item.id] = Number(raw.precios[index].precio);
      }
    });

    this.ref.close({
      precios,
      metodoPago: raw.metodoPago as MetodoPago,
      fechaVenta: raw.fechaVenta.toISOString(),
      clienteId: raw.clienteId || undefined,
      clienteNombre: raw.clienteNombre || undefined,
      clienteTelefono: raw.clienteTelefono || undefined,
      clienteCi: raw.clienteCi || undefined,
      notas: raw.notas || undefined,
    } satisfies VentaEditResult);
  }
}
