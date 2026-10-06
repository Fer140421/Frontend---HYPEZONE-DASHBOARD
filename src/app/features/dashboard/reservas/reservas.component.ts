import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  firstValueFrom,
  map,
  of,
  shareReplay,
  startWith,
  take,
} from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { CajaService } from '../../../core/services/caja.service';
import { Cliente } from '../../../core/models/cliente.model';
import { Producto, imagenesProducto, precioProducto } from '../../../core/models/producto.model';
import {
  EstadoReserva,
  Reserva,
  ReservaPago,
  estadosReserva,
  totalAnticipos,
} from '../../../core/models/reserva.model';
import { MetodoPago, metodosPago } from '../../../core/models/venta.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { ReservaRepository } from '../../../core/repositories/reserva.repository';
import { ReservaService } from '../../../core/services/reserva.service';
import { cloudinaryCardUrl } from '../../../core/utils/cloudinary-image.util';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';
import { ClienteFormDialogComponent, ClienteFormDialogData } from '../clientes/clientes.component';
import { CajaAperturaDialogComponent } from '../ventas/caja-apertura-dialog/caja-apertura-dialog.component';

@Component({
  selector: 'app-reservas',
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
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class ReservasComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly repository = inject(ReservaRepository);
  private readonly service = inject(ReservaService);
  private readonly cajaService = inject(CajaService);
  private readonly clientesRepository = inject(ClienteRepository);
  private readonly productosRepository = inject(ProductoRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly auth = inject(AuthService);
  readonly cajaActiva = this.cajaService.miCajaAbierta;
  readonly mode = signal<'list' | 'new' | 'edit'>('list');
  readonly editingReservaId = signal<string | null>(null);
  readonly editingReserva = signal<Reserva | null>(null);
  readonly processing = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly search = this.fb.nonNullable.control('');
  readonly selected = new Map<string, Producto>();
  readonly clienteSearchControl = this.fb.nonNullable.control('');
  readonly selectedCliente = signal<Cliente | null>(null);
  readonly clienteResultados = signal<Cliente[]>([]);
  readonly clienteBusquedaRealizada = signal(false);
  readonly buscandoCliente = signal(false);

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly columns = [
    'cliente',
    'productos',
    'total',
    'anticipo',
    'saldo',
    'vencimiento',
    'estado',
    'acciones',
  ];
  readonly totalAnticipos = totalAnticipos;
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly metodos = metodosPago;
  readonly estados = estadosReserva;

  readonly clientes$ = this.clientesRepository.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  private readonly allProductos$ = this.productosRepository.getAll(true).pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly productos$ = this.allProductos$.pipe(
    map((items) =>
      items.filter(
        (item) =>
          item.activo !== false &&
          (item.estado === 'disponible' ||
            (!!item.id &&
              (this.selected.has(item.id) ||
                (this.editingReserva()?.detalles ?? []).some((d) => d.productoId === item.id)))),
      ),
    ),
  );

  readonly catalogo$ = combineLatest([
    this.productos$,
    this.search.valueChanges.pipe(startWith('')),
  ]).pipe(
    map(([items, search]) => {
      const term = search.toLowerCase().trim();
      return items.filter(
        (item) =>
          !term ||
          [item.nombre, item.marca, item.codigo, item.categoria].some((value) =>
            (value ?? '').toLowerCase().includes(term),
          ),
      );
    }),
  );

  readonly reservas$ = this.repository.getAll().pipe(
    catchError(() => {
      this.loadError.set(
        'No se pudieron cargar las reservas. Verifica que tu usuario tenga permisos de Ventas.',
      );
      return of([] as Reserva[]);
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly filtered$ = combineLatest([
    this.reservas$,
    this.search.valueChanges.pipe(startWith('')),
  ]).pipe(
    map(([items, search]) => {
      const term = search.toLowerCase().trim();
      return items.filter(
        (item) =>
          !term ||
          [item.clienteNombre, item.estado, ...item.detalles.map((d) => d.nombreProducto)]
            .join(' ')
            .toLowerCase()
            .includes(term),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly listVm$ = combineLatest([this.filtered$, this.pagination$]).pipe(
    map(([items, pagination]) => ({
      items: paginateItems(items, pagination),
      resumen: {
        activas: items.filter((item) => item.estado === 'activa').length,
        anticipos: items
          .filter((item) => item.estado === 'activa')
          .reduce((sum, item) => sum + totalAnticipos(item), 0),
        saldo: items
          .filter((item) => item.estado === 'activa')
          .reduce((sum, item) => sum + Number(item.saldoPendiente), 0),
      },
    })),
  );

  readonly form = this.fb.nonNullable.group({
    clienteId: [''],
    clienteNombre: [''],
    clienteTelefono: [''],
    clienteCi: [''],
    detalles: this.fb.array([] as ReturnType<ReservasComponent['detailGroup']>[]),
    anticipo: [0, [Validators.required, Validators.min(0)]],
    metodoAnticipo: ['efectivo' as MetodoPago, Validators.required],
    fechaVencimiento: [null as Date | null, Validators.required],
    notas: [''],
  });

  get detalles(): FormArray {
    return this.form.controls.detalles;
  }

  get total(): number {
    return this.detalles.controls.reduce(
      (sum, item) => sum + Number(item.get('precioAcordado')?.value ?? 0),
      0,
    );
  }

  get totalAnticiposReservaEdit(): number {
    const edit = this.editingReserva();
    return edit ? totalAnticipos(edit) : 0;
  }

  get saldo(): number {
    if (this.mode() === 'edit') {
      return Math.max(0, this.total - this.totalAnticiposReservaEdit);
    }
    return Math.max(0, this.total - Number(this.form.controls.anticipo.value ?? 0));
  }

  ngOnInit(): void {
    this.route.url.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parts) => {
      if (parts.some((item) => item.path === 'nueva')) {
        this.resetForm();
        this.mode.set('new');
        this.editingReservaId.set(null);
        this.editingReserva.set(null);
      } else if (parts.some((item) => item.path === 'editar')) {
        this.mode.set('edit');
      } else {
        this.mode.set('list');
        this.editingReservaId.set(null);
        this.editingReserva.set(null);
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (params) => {
      const id = params.get('id');
      if (id && this.mode() === 'edit') {
        this.editingReservaId.set(id);
        await this.cargarReservaParaEdicion(id);
      }
    });
  }

  private resetForm(): void {
    this.selected.clear();
    this.detalles.clear();
    this.form.reset({
      clienteId: '',
      clienteNombre: '',
      clienteTelefono: '',
      clienteCi: '',
      anticipo: 0,
      metodoAnticipo: 'efectivo',
      fechaVencimiento: null,
      notas: '',
    });
    this.selectedCliente.set(null);
    this.clienteSearchControl.setValue('');
    this.clienteResultados.set([]);
    this.clienteBusquedaRealizada.set(false);
  }

  private async cargarReservaParaEdicion(id: string): Promise<void> {
    try {
      this.resetForm();
      const reserva = await firstValueFrom(this.repository.getById(id).pipe(take(1)));
      if (!reserva) {
        this.message('La reserva solicitada no existe.');
        void this.router.navigate(['/dashboard/reservas']);
        return;
      }
      if (reserva.estado !== 'activa') {
        this.message('Solo se pueden editar reservas en estado activa.');
        void this.router.navigate(['/dashboard/reservas']);
        return;
      }

      this.editingReserva.set(reserva);

      // Cargar cliente
      const cliente: Cliente = {
        id: reserva.clienteId,
        nombreCompleto: reserva.clienteNombre,
        celular: reserva.clienteTelefono,
        ci: reserva.clienteCi,
      };
      this.applyCliente(cliente);

      // Cargar campos de la reserva
      this.form.patchValue({
        fechaVencimiento: reserva.fechaVencimiento ? new Date(reserva.fechaVencimiento) : null,
        notas: reserva.notas || '',
      });

      // Cargar productos
      const allProducts = await firstValueFrom(this.allProductos$.pipe(take(1)));
      reserva.detalles.forEach((detalle) => {
        let prod = allProducts.find((p) => p.id === detalle.productoId);
        if (!prod) {
          prod = {
            id: detalle.productoId,
            nombre: detalle.nombreProducto,
            precioVenta: detalle.precioAcordado,
            estado: 'reservado',
            activo: true,
          } as Producto;
        }
        this.selected.set(detalle.productoId, prod);
        const group = this.detailGroup(prod);
        group.patchValue({ precioAcordado: Number(detalle.precioAcordado) });
        this.detalles.push(group);
      });
    } catch {
      this.message('Error al cargar la reserva para editar.');
      void this.router.navigate(['/dashboard/reservas']);
    }
  }

  add(producto: Producto): void {
    if (!producto.id || this.selected.has(producto.id)) return;
    this.selected.set(producto.id, producto);
    this.detalles.push(this.detailGroup(producto));
  }

  remove(index: number): void {
    const id = this.detalles.at(index).get('productoId')?.value;
    this.detalles.removeAt(index);
    if (id) this.selected.delete(id);
  }

  isSelected(producto: Producto): boolean {
    return !!producto.id && this.selected.has(producto.id);
  }

  price(producto: Producto): number {
    return precioProducto(producto);
  }

  effectivePrice(producto: Producto): number {
    const offer = Number(producto.precioOferta);
    return producto.precioOferta !== undefined &&
      Number.isFinite(offer) &&
      offer > 0 &&
      offer < this.price(producto)
      ? offer
      : this.price(producto);
  }

  hasOffer(producto: Producto): boolean {
    return this.effectivePrice(producto) < this.price(producto);
  }

  image(producto: Producto): string {
    return cloudinaryCardUrl(imagenesProducto(producto)[0] ?? '');
  }

  selectedImage(id: string): string {
    const producto = this.selected.get(id);
    return producto ? this.image(producto) : '';
  }

  selectCliente(cliente: Cliente): void {
    this.applyCliente(cliente);
    this.clienteBusquedaRealizada.set(false);
  }

  clearCliente(): void {
    this.selectedCliente.set(null);
    this.clienteSearchControl.setValue('');
    this.clienteResultados.set([]);
    this.clienteBusquedaRealizada.set(false);
    this.form.patchValue({ clienteId: '', clienteNombre: '', clienteTelefono: '', clienteCi: '' });
  }

  async buscarCliente(): Promise<void> {
    const term = this.normalizeSearch(this.clienteSearchControl.getRawValue());
    if (!term || this.buscandoCliente()) {
      if (!term) this.message('Escribe un nombre, CI o celular para buscar.');
      return;
    }
    this.buscandoCliente.set(true);
    this.selectedCliente.set(null);
    this.form.patchValue({ clienteId: '', clienteNombre: '', clienteTelefono: '', clienteCi: '' });
    try {
      const clientes = await firstValueFrom(this.clientes$.pipe(take(1)));
      const resultados = clientes.filter(
        (cliente) =>
          cliente.activo !== false &&
          [cliente.nombreCompleto, cliente.ci, cliente.celular].some((value) =>
            this.normalizeSearch(value ?? '').includes(term),
          ),
      );
      this.clienteBusquedaRealizada.set(true);
      if (resultados.length === 1) {
        this.selectCliente(resultados[0]);
        this.message('Cliente encontrado y seleccionado.');
      } else {
        this.clienteResultados.set(resultados);
        this.message(
          resultados.length
            ? 'Selecciona el cliente correcto.'
            : 'No se encontró el cliente. Puedes registrarlo.',
        );
      }
    } finally {
      this.buscandoCliente.set(false);
    }
  }

  openClientDialog(): void {
    if (!this.auth.can('clients.create')) return;
    this.dialog
      .open(ClienteFormDialogComponent, {
        width: 'min(560px,96vw)',
        maxHeight: '90vh',
        data: { deferred: true } satisfies ClienteFormDialogData,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.applyCliente(saved as Cliente);
          this.message('Cliente preparado para la reserva.');
        }
      });
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  async save(): Promise<void> {
    const isEdit = this.mode() === 'edit';
    const requiredPermission = isEdit ? 'sales.update' : 'sales.create';
    if (this.processing() || !this.auth.can(requiredPermission)) return;

    if (!this.detalles.length) {
      this.message('Agrega al menos un producto a la reserva.');
      return;
    }
    if (!this.selectedCliente()) {
      this.message('Busca y selecciona un cliente para continuar.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.message('Completa los datos requeridos de la reserva.');
      return;
    }

    const raw = this.form.getRawValue();

    if (isEdit) {
      const edit = this.editingReserva();
      if (!edit || !this.editingReservaId()) {
        this.message('No se encontró la información de la reserva a editar.');
        return;
      }
      const anticiposPagados = totalAnticipos(edit);
      if (this.total < anticiposPagados) {
        this.message(
          `El total no puede ser menor a los anticipos ya registrados (Bs ${anticiposPagados}).`,
        );
        return;
      }
    } else {
      const anticipo = Number(raw.anticipo);
      if (anticipo > this.total) {
        this.message('El anticipo no puede superar el total.');
        return;
      }
    }

    this.processing.set(true);
    try {
      const cliente = this.selectedCliente()!;
      const detallesInput = raw.detalles.map((item) => ({
        producto: this.selected.get(item.productoId)!,
        precioAcordado: Number(item.precioAcordado),
      }));

      if (isEdit) {
        await this.service.editar(this.editingReservaId()!, {
          cliente,
          clienteNuevo: cliente.id
            ? undefined
            : { nombreCompleto: cliente.nombreCompleto, celular: cliente.celular, ci: cliente.ci },
          detalles: detallesInput,
          fechaVencimiento: raw.fechaVencimiento!.toISOString(),
          notas: raw.notas,
        });
        this.message('Reserva actualizada correctamente.');
      } else {
        await this.service.crear({
          cliente,
          clienteNuevo: cliente.id
            ? undefined
            : { nombreCompleto: cliente.nombreCompleto, celular: cliente.celular, ci: cliente.ci },
          detalles: detallesInput,
          anticipo: Number(raw.anticipo),
          metodoAnticipo: raw.metodoAnticipo,
          fechaReserva: new Date().toISOString(),
          fechaVencimiento: raw.fechaVencimiento!.toISOString(),
          notas: raw.notas,
        });
        this.message('Reserva registrada correctamente.');
      }
      await this.router.navigate(['/dashboard/reservas']);
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo guardar la reserva.');
    } finally {
      this.processing.set(false);
    }
  }

  abonar(reserva: Reserva): void {
    if (!reserva.id || !this.auth.can('sales.update')) return;
    if (reserva.estado !== 'activa') {
      this.message('Solo se pueden registrar abonos en reservas activas.');
      return;
    }
    if (Number(reserva.saldoPendiente) <= 0) {
      this.message('Esta reserva no tiene saldo pendiente por cobrar.');
      return;
    }

    this.dialog
      .open(ReservaPagoDialogComponent, {
        width: 'min(480px,96vw)',
        data: {
          title: 'Registrar abono',
          maximo: reserva.saldoPendiente,
          total: reserva.total,
          anticipos: totalAnticipos(reserva),
        },
      })
      .afterClosed()
      .subscribe(async (pago?: ReservaPago) => {
        if (!pago) return;
        try {
          await this.service.registrarAbono(reserva.id!, pago);
          this.message('Abono registrado correctamente.');
        } catch (error) {
          this.message(error instanceof Error ? error.message : 'No se pudo registrar el abono.');
        }
      });
  }

  convertir(reserva: Reserva): void {
    if (!reserva.id || !this.auth.can('sales.update')) return;
    if (reserva.estado !== 'activa') {
      this.message('Solo se pueden convertir a venta reservas activas.');
      return;
    }

    const caja = this.cajaActiva();
    if (!caja?.id) {
      this.snack
        .open('No tienes una caja abierta. Debes abrir tu caja antes de vender.', 'Abrir caja', {
          duration: 5000,
        })
        .onAction()
        .subscribe(() => {
          this.abrirDialogoApertura();
        });
      this.abrirDialogoApertura();
      return;
    }

    this.dialog
      .open(ReservaPagoDialogComponent, {
        width: 'min(500px,96vw)',
        data: {
          title: 'Confirmar venta de reserva',
          maximo: reserva.saldoPendiente,
          total: reserva.total,
          anticipos: totalAnticipos(reserva),
          conversion: true,
        },
      })
      .afterClosed()
      .subscribe(async (pago?: ReservaPago) => {
        if (!pago) return;
        try {
          const user = this.auth.firebaseUser();
          const profile = this.auth.profile();
          await this.service.convertirEnVenta(reserva.id!, pago.metodoPago, pago.fecha, {
            cajaId: caja.id,
            usuarioVentaId: user?.uid,
            usuarioVentaNombre: profile?.displayName || user?.displayName || user?.email || 'Usuario',
          });
          this.message('¡Reserva convertida en venta exitosamente!');
        } catch (error) {
          this.message(error instanceof Error ? error.message : 'No se pudo convertir la reserva.');
        }
      });
  }

  abrirDialogoApertura(): void {
    const ref = this.dialog.open(CajaAperturaDialogComponent, {
      width: 'min(460px, 94vw)',
      disableClose: true,
    });

    ref.afterClosed().subscribe((abierta: boolean) => {
      if (abierta) {
        this.message('¡Caja abierta exitosamente! Ahora puedes confirmar la venta.');
      } else {
        this.message('Debes abrir caja para poder registrar ventas.');
      }
    });
  }

  cancelar(reserva: Reserva): void {
    if (!reserva.id || !this.auth.can('sales.update')) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Cancelar reserva',
          message:
            'Los productos volverán a estar disponibles en el catálogo. Los anticipos quedarán guardados en el historial.',
          confirmText: 'Cancelar reserva',
        },
      })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await this.service.cancelar(reserva.id!);
          this.message('Reserva cancelada y productos liberados.');
        } catch (error) {
          this.message(error instanceof Error ? error.message : 'No se pudo cancelar la reserva.');
        }
      });
  }

  statusLabel(status: EstadoReserva): string {
    return (
      {
        activa: 'Activa',
        confirmada: 'Vendida',
        cancelada: 'Cancelada',
        vencida: 'Vencida',
      } as Record<EstadoReserva, string>
    )[status];
  }

  productNames(reserva: Reserva): string {
    return reserva.detalles.map((detail) => detail.nombreProducto).join(', ');
  }

  private detailGroup(producto: Producto) {
    return this.fb.nonNullable.group({
      productoId: [producto.id!],
      nombre: [producto.nombre],
      precioAcordado: [this.price(producto), [Validators.required, Validators.min(0)]],
    });
  }

  selectedSubtitle(id: string): string {
    const producto = this.selected.get(id);
    return producto
      ? [producto.marca, producto.talla && `Talla ${producto.talla}`].filter(Boolean).join(' · ')
      : '';
  }

  private applyCliente(cliente: Cliente): void {
    this.selectedCliente.set(cliente);
    this.clienteResultados.set([]);
    this.clienteSearchControl.setValue(cliente.nombreCompleto, { emitEvent: false });
    this.form.patchValue({
      clienteId: cliente.id ?? '',
      clienteNombre: cliente.nombreCompleto,
      clienteTelefono: cliente.celular,
      clienteCi: cliente.ci ?? '',
    });
  }

  private normalizeSearch(value: string): string {
    return value
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 3500 });
  }
}

@Component({
  selector: 'app-reserva-pago-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon class="dialog-title-icon">{{ data.conversion ? 'point_of_sale' : 'payments' }}</mat-icon>
      {{ data.title }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="mat-typography dialog-content">
        @if (data.conversion) {
          <div class="summary-card">
            <div class="summary-line">
              <span>Total de la reserva:</span>
              <strong>{{ (data.total ?? data.maximo) | currency: 'BOB' : 'symbol-narrow' }}</strong>
            </div>
            @if (data.anticipos !== undefined && data.anticipos > 0) {
              <div class="summary-line text-muted">
                <span>Anticipos pagados:</span>
                <span>- {{ data.anticipos | currency: 'BOB' : 'symbol-narrow' }}</span>
              </div>
            }
            <div class="summary-line highlight">
              <span>Saldo a cobrar:</span>
              <strong class="saldo-value">{{ data.maximo | currency: 'BOB' : 'symbol-narrow' }}</strong>
            </div>
          </div>
          @if (data.maximo === 0) {
            <div class="info-alert success">
              <mat-icon>check_circle</mat-icon>
              <span>Esta reserva ya está 100% pagada. Al confirmar se registrará la venta en caja.</span>
            </div>
          } @else {
            <p class="dialog-description">
              Se aplicarán los anticipos y se cobrará el saldo pendiente de <strong>{{ data.maximo | currency: 'BOB' : 'symbol-narrow' }}</strong>.
            </p>
          }
        } @else {
          <div class="summary-card">
            <div class="summary-line highlight">
              <span>Saldo pendiente actual:</span>
              <strong class="saldo-value">{{ data.maximo | currency: 'BOB' : 'symbol-narrow' }}</strong>
            </div>
          </div>
        }

        <div class="dialog-form-fields">
          @if (!data.conversion || data.maximo > 0) {
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>{{ data.conversion ? 'Monto saldo a cobrar' : 'Monto a abonar' }}</mat-label>
              <span matTextPrefix class="currency-prefix">Bs&nbsp;</span>
              <input
                matInput
                type="number"
                formControlName="monto"
                [readonly]="data.conversion"
                step="0.5"
                min="0"
                required
              />
              <mat-icon matSuffix>payments</mat-icon>
              @if (form.controls.monto.hasError('required') && form.controls.monto.touched) {
                <mat-error>El monto es obligatorio.</mat-error>
              }
              @if (form.controls.monto.hasError('min')) {
                <mat-error>El monto debe ser mayor a 0.</mat-error>
              }
              @if (form.controls.monto.hasError('max')) {
                <mat-error>No puede superar el saldo (Bs {{ data.maximo }}).</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Método de pago</mat-label>
              <mat-select formControlName="metodoPago">
                <mat-option value="efectivo">Efectivo</mat-option>
                <mat-option value="qr">QR</mat-option>
              </mat-select>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Nota / Observación (Opcional)</mat-label>
            <input matInput formControlName="notas" placeholder="Ej: Pago restante en tienda" />
          </mat-form-field>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button mat-button type="button" mat-dialog-close>Volver</button>
        <button mat-flat-button class="primary-action" type="submit" [disabled]="form.invalid">
          <mat-icon>{{ data.conversion ? 'check' : 'add_circle' }}</mat-icon>
          {{ data.conversion ? 'Confirmar venta' : 'Registrar abono' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 0;
      }
      .dialog-title-icon {
        color: var(--mat-sys-primary);
      }
      .dialog-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-top: 12px !important;
        min-width: min(420px, 86vw);
      }
      .summary-card {
        display: grid;
        gap: 8px;
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--mat-sys-surface-container-low, #f8f9fa);
        border: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      }
      .summary-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.9rem;
      }
      .summary-line.text-muted {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.85rem;
      }
      .summary-line.highlight {
        border-top: 1px dashed var(--mat-sys-outline-variant, #cbd5e1);
        padding-top: 8px;
        margin-top: 2px;
      }
      .saldo-value {
        font-size: 1.15rem;
        color: var(--mat-sys-primary);
      }
      .dialog-description {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.4;
        color: var(--mat-sys-on-surface-variant);
      }
      .info-alert {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 0.84rem;
      }
      .info-alert.success {
        background: #ecfdf5;
        color: #065f46;
        border: 1px solid #a7f3d0;
      }
      .info-alert mat-icon {
        color: #059669;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .dialog-form-fields {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .w-full {
        width: 100%;
      }
      .dialog-actions {
        padding: 12px 24px 16px;
      }
    `,
  ],
})
export class ReservaPagoDialogComponent {
  private readonly fb = inject(FormBuilder);
  readonly ref = inject(MatDialogRef<ReservaPagoDialogComponent>);
  readonly data = inject<{
    title: string;
    maximo: number;
    total?: number;
    anticipos?: number;
    conversion?: boolean;
  }>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    monto: [
      this.data.maximo,
      [
        Validators.required,
        Validators.min(this.data.conversion && this.data.maximo === 0 ? 0 : 0.01),
        Validators.max(Math.max(0.01, this.data.maximo)),
      ],
    ],
    metodoPago: ['efectivo' as MetodoPago, Validators.required],
    notas: [''],
  });

  save(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    this.ref.close({
      monto: Number(raw.monto),
      metodoPago: raw.metodoPago,
      fecha: new Date().toISOString(),
      notas: raw.notas || undefined,
    } satisfies ReservaPago);
  }
}
