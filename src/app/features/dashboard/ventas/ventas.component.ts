import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';
import { ClienteFormDialogComponent } from '../clientes/clientes.component';

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatAutocompleteModule,
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
    EmptyStateComponent,
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
  readonly procesandoVenta = signal(false);
  readonly searchControl = this.fb.nonNullable.control('');
  readonly clienteSearchControl = this.fb.nonNullable.control('');
  readonly selectedCliente = signal<Cliente | null>(null);

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

  readonly clientesFiltrados$ = combineLatest([
    this.clientesSource$,
    this.clienteSearchControl.valueChanges.pipe(startWith('')),
  ]).pipe(
    map(([clientes, search]) => {
      const term = search.toLowerCase().trim();
      return clientes.filter((cliente) => {
        const matchesState = cliente.activo !== false || cliente.id === this.selectedCliente()?.id;
        const matchesTerm =
          !term ||
          [cliente.nombreCompleto, cliente.ci, cliente.celular].some((value) =>
            (value ?? '').toLowerCase().includes(term),
          );
        return matchesState && matchesTerm;
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
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
  });

  readonly ventasFiltradas$ = combineLatest([
    this.ventasSource$,
    this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())),
  ]).pipe(
    map(([ventas, filters]) => {
      this.ventasActuales = ventas;
      const producto = (filters.producto ?? '').toLowerCase().trim();
      const desde = filters.desde ? new Date(filters.desde).getTime() : 0;
      return ventas.filter(
        (venta) =>
          (!producto || venta.nombreProducto.toLowerCase().includes(producto)) &&
          (!filters.metodoPago || venta.metodoPago === filters.metodoPago) &&
          (!desde || new Date(venta.fechaVenta).getTime() >= desde),
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

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  effectivePrice(producto: Producto): number {
    const offer = Number(producto.precioOferta);
    return producto.precioOferta !== undefined &&
      Number.isFinite(offer) &&
      offer >= 0 &&
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
  }

  clearCliente(): void {
    this.selectedCliente.set(null);
    this.clienteSearchControl.setValue('');
    this.saleForm.patchValue({
      clienteId: '',
      clienteNombre: '',
      clienteTelefono: '',
      clienteCi: '',
    });
  }

  async openClientDialog(): Promise<void> {
    if (!this.auth.can('clients.create')) return;
    const result = await firstValueFrom(
      this.dialog
        .open(ClienteFormDialogComponent, {
          width: 'min(560px, 96vw)',
          maxHeight: '90vh',
        })
        .afterClosed(),
    );
    if (!result) {
      return;
    }

    const clientes = await firstValueFrom(this.clienteRepository.getAll(true).pipe(take(1)));
    const cliente = clientes.find((item) => item.id === result);
    if (cliente) {
      this.applyCliente(cliente);
      this.snackBar.open('Cliente registrado y seleccionado.', 'OK', { duration: 2600 });
    }
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
    this.clienteSearchControl.setValue(cliente.nombreCompleto, { emitEvent: false });
    this.saleForm.patchValue({
      clienteId: cliente.id ?? '',
      clienteNombre: cliente.nombreCompleto,
      clienteTelefono: cliente.celular,
      clienteCi: cliente.ci ?? '',
    });
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
