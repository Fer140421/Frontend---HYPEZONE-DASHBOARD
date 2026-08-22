import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
import { BehaviorSubject, catchError, combineLatest, firstValueFrom, map, of, shareReplay, startWith, take } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { Cliente } from '../../../core/models/cliente.model';
import { Producto, imagenesProducto, precioProducto } from '../../../core/models/producto.model';
import { EstadoReserva, Reserva, ReservaPago, estadosReserva, totalAnticipos } from '../../../core/models/reserva.model';
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
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, PaginationState, paginateItems } from '../../../shared/utils/pagination.util';
import { ClienteFormDialogComponent } from '../clientes/clientes.component';

@Component({
  selector: 'app-reservas', standalone: true,
  imports: [AsyncPipe, CurrencyPipe, DatePipe, RouterLink, ReactiveFormsModule, MatButtonModule, MatCardModule,
    MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatPaginatorModule,
    MatSelectModule, MatSnackBarModule, MatTableModule, MatTooltipModule, EmptyStateComponent, LoadingComponent, PageHeaderComponent],
  templateUrl: './reservas.html', styleUrl: './reservas.css',
})
export class ReservasComponent implements OnInit {
  private readonly fb = inject(FormBuilder); private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog); private readonly snack = inject(MatSnackBar); private readonly repository = inject(ReservaRepository);
  private readonly service = inject(ReservaService); private readonly clientesRepository = inject(ClienteRepository); private readonly productosRepository = inject(ProductoRepository);
  readonly auth = inject(AuthService); readonly mode = signal<'list' | 'new'>('list'); readonly processing = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly search = this.fb.nonNullable.control(''); readonly selected = new Map<string, Producto>();
  readonly clienteSearchControl = this.fb.nonNullable.control(''); readonly selectedCliente = signal<Cliente | null>(null); readonly clienteResultados = signal<Cliente[]>([]); readonly clienteBusquedaRealizada = signal(false); readonly buscandoCliente = signal(false);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  readonly columns = ['cliente', 'productos', 'total', 'anticipo', 'saldo', 'vencimiento', 'estado', 'acciones'];
  readonly totalAnticipos = totalAnticipos;
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS; readonly metodos = metodosPago; readonly estados = estadosReserva;
  readonly clientes$ = this.clientesRepository.getAll().pipe(map(items => items.sort((a,b) => a.nombreCompleto.localeCompare(b.nombreCompleto))), shareReplay({bufferSize:1, refCount:true}));
  readonly productos$ = this.productosRepository.getAll().pipe(map(items => items.filter(item => item.estado === 'disponible' && item.activo !== false)), shareReplay({bufferSize:1, refCount:true}));
  readonly catalogo$ = combineLatest([this.productos$, this.search.valueChanges.pipe(startWith(''))]).pipe(
    map(([items, search]) => {
      const term = search.toLowerCase().trim();
      return items.filter((item) => !term || [item.nombre, item.marca, item.codigo, item.categoria].some((value) => (value ?? '').toLowerCase().includes(term)));
    }),
  );
  readonly reservas$ = this.repository.getAll().pipe(
    catchError(() => {
      this.loadError.set('No se pudieron cargar las reservas. Verifica que las reglas de Firestore actualizadas estén desplegadas y que tu usuario tenga acceso a Ventas.');
      return of([] as Reserva[]);
    }),
    shareReplay({bufferSize:1, refCount:true}),
  );
  readonly filtered$ = combineLatest([this.reservas$, this.search.valueChanges.pipe(startWith(''))]).pipe(map(([items, search]) => {
    const term = search.toLowerCase().trim(); return items.filter(item => !term || [item.clienteNombre, item.estado, ...item.detalles.map(d => d.nombreProducto)].join(' ').toLowerCase().includes(term));
  }), shareReplay({bufferSize:1, refCount:true}));
  readonly listVm$ = combineLatest([this.filtered$, this.pagination$]).pipe(map(([items, pagination]) => ({ items: paginateItems(items, pagination), resumen: {
    activas: items.filter(item => item.estado === 'activa').length, anticipos: items.filter(item => item.estado === 'activa').reduce((sum, item) => sum + totalAnticipos(item), 0), saldo: items.filter(item => item.estado === 'activa').reduce((sum, item) => sum + Number(item.saldoPendiente), 0),
  }})));
  readonly form = this.fb.nonNullable.group({ clienteId: ['', Validators.required], detalles: this.fb.array([] as ReturnType<ReservasComponent['detailGroup']>[]), anticipo: [0, [Validators.required, Validators.min(0)]], metodoAnticipo: ['efectivo' as MetodoPago, Validators.required], fechaVencimiento: [null as Date | null], notas: [''] });
  get detalles(): FormArray { return this.form.controls.detalles; }
  get total(): number { return this.detalles.controls.reduce((sum, item) => sum + Number(item.get('precioAcordado')?.value ?? 0), 0); }
  get saldo(): number { return Math.max(0, this.total - Number(this.form.controls.anticipo.value ?? 0)); }
  ngOnInit(): void { this.route.url.subscribe(parts => this.mode.set(parts.some(item => item.path === 'nueva') ? 'new' : 'list')); }
  add(producto: Producto): void { if (!producto.id || this.selected.has(producto.id)) return; this.selected.set(producto.id, producto); this.detalles.push(this.detailGroup(producto)); }
  remove(index: number): void { const id = this.detalles.at(index).get('productoId')?.value; this.detalles.removeAt(index); if (id) this.selected.delete(id); }
  isSelected(producto: Producto): boolean { return !!producto.id && this.selected.has(producto.id); }
  price(producto: Producto): number { return precioProducto(producto); }
  effectivePrice(producto: Producto): number { const offer = Number(producto.precioOferta); return producto.precioOferta !== undefined && Number.isFinite(offer) && offer > 0 && offer < this.price(producto) ? offer : this.price(producto); }
  hasOffer(producto: Producto): boolean { return this.effectivePrice(producto) < this.price(producto); }
  image(producto: Producto): string { return cloudinaryCardUrl(imagenesProducto(producto)[0] ?? ''); }
  selectCliente(cliente: Cliente): void { this.selectedCliente.set(cliente); this.form.controls.clienteId.setValue(cliente.id!); this.clienteResultados.set([]); this.clienteBusquedaRealizada.set(false); }
  clearCliente(): void { this.selectedCliente.set(null); this.form.controls.clienteId.setValue(''); this.clienteSearchControl.setValue(''); this.clienteResultados.set([]); this.clienteBusquedaRealizada.set(false); }
  async buscarCliente(): Promise<void> { const term = this.normalizeSearch(this.clienteSearchControl.getRawValue()); if (!term || this.buscandoCliente()) return; this.buscandoCliente.set(true); try { const clientes = await firstValueFrom(this.clientes$.pipe(take(1))); const resultados = clientes.filter(cliente => [cliente.nombreCompleto, cliente.ci, cliente.celular].some(value => this.normalizeSearch(value ?? '').includes(term))); this.clienteBusquedaRealizada.set(true); if (resultados.length === 1) this.selectCliente(resultados[0]); else this.clienteResultados.set(resultados); } finally { this.buscandoCliente.set(false); } }
  openClientDialog(): void { if (!this.auth.can('clients.create')) return; this.dialog.open(ClienteFormDialogComponent, { width:'min(560px,96vw)', maxHeight:'90vh' }).afterClosed().subscribe(saved => { if (saved) this.message('Cliente registrado. Búscalo y selecciónalo para la reserva.'); }); }
  updatePage(event: PageEvent): void { this.pagination$.next({pageIndex:event.pageIndex, pageSize:event.pageSize}); }
  async save(): Promise<void> { if (this.form.invalid || !this.detalles.length || this.processing() || !this.auth.can('sales.create')) return; const raw = this.form.getRawValue(); const anticipo = Number(raw.anticipo); if (anticipo > this.total) { this.message('El anticipo no puede superar el total.'); return; }
    this.processing.set(true); try { const clientes = await firstValueFrom(this.clientes$.pipe(take(1))); const cliente = clientes.find(item => item.id === raw.clienteId); if (!cliente) throw new Error('Selecciona un cliente válido.'); await this.service.crear({ cliente, detalles: raw.detalles.map(item => ({producto:this.selected.get(item.productoId)!, precioAcordado:Number(item.precioAcordado)})), anticipo, metodoAnticipo:raw.metodoAnticipo, fechaReserva:new Date().toISOString(), fechaVencimiento:raw.fechaVencimiento?.toISOString(), notas:raw.notas }); this.message('Reserva registrada correctamente.'); await this.router.navigate(['/dashboard/reservas']);
    } catch(error) { this.message(error instanceof Error ? error.message : 'No se pudo registrar la reserva.'); } finally { this.processing.set(false); } }
  abonar(reserva: Reserva): void { if (!reserva.id || !this.auth.can('sales.update')) return; this.dialog.open(ReservaPagoDialogComponent,{width:'min(450px,96vw)',data:{title:'Registrar abono',maximo:reserva.saldoPendiente}}).afterClosed().subscribe(async (pago?: ReservaPago) => { if (!pago) return; try { await this.service.registrarAbono(reserva.id!, pago); this.message('Abono registrado.'); } catch (error) { this.message(error instanceof Error ? error.message : 'No se pudo registrar el abono.'); }}); }
  convertir(reserva: Reserva): void { if (!reserva.id || !this.auth.can('sales.update')) return; this.dialog.open(ReservaPagoDialogComponent,{width:'min(450px,96vw)',data:{title:'Confirmar venta',maximo:reserva.saldoPendiente,conversion:true}}).afterClosed().subscribe(async (pago?: ReservaPago) => { if (!pago) return; try { await this.service.convertirEnVenta(reserva.id!, pago.metodoPago, pago.fecha); this.message('Reserva convertida en venta.'); } catch(error) { this.message(error instanceof Error ? error.message : 'No se pudo convertir la reserva.'); }}); }
  cancelar(reserva: Reserva): void { if (!reserva.id || !this.auth.can('sales.update')) return; this.dialog.open(ConfirmDialogComponent,{data:{title:'Cancelar reserva',message:'Los productos volverán a estar disponibles. Los anticipos quedarán registrados en el historial.',confirmText:'Cancelar reserva'}}).afterClosed().subscribe(async ok => { if (!ok) return; try { await this.service.cancelar(reserva.id!); this.message('Reserva cancelada y productos liberados.'); } catch(error) { this.message(error instanceof Error ? error.message : 'No se pudo cancelar la reserva.'); }}); }
  statusLabel(status: EstadoReserva): string { return ({activa:'Activa',confirmada:'Vendida',cancelada:'Cancelada',vencida:'Vencida'} as Record<EstadoReserva,string>)[status]; }
  productNames(reserva: Reserva): string { return reserva.detalles.map((detail) => detail.nombreProducto).join(', '); }
  private detailGroup(producto: Producto) { return this.fb.nonNullable.group({productoId:[producto.id!], nombre:[producto.nombre], precioAcordado:[this.price(producto), [Validators.required, Validators.min(0)]]}); }
  private normalizeSearch(value: string): string { return value.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''); }
  private message(text: string): void { this.snack.open(text, 'OK', {duration:3500}); }
}

@Component({selector:'app-reserva-pago-dialog',standalone:true,imports:[ReactiveFormsModule,MatButtonModule,MatDialogModule,MatFormFieldModule,MatInputModule,MatSelectModule],template:`<h2 mat-dialog-title>{{ data.title }}</h2><form [formGroup]="form" (ngSubmit)="save()"><mat-dialog-content><p>{{ data.conversion ? 'Se aplicarán todos los anticipos y se cobrará el saldo pendiente.' : 'Saldo pendiente: Bs ' + data.maximo }}</p><mat-form-field appearance="outline"><mat-label>Monto</mat-label><input matInput type="number" formControlName="monto" [readonly]="data.conversion"></mat-form-field><mat-form-field appearance="outline"><mat-label>Método de pago</mat-label><mat-select formControlName="metodoPago"><mat-option value="efectivo">Efectivo</mat-option><mat-option value="qr">QR</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>Nota</mat-label><input matInput formControlName="notas"></mat-form-field></mat-dialog-content><mat-dialog-actions align="end"><button mat-button type="button" mat-dialog-close>Volver</button><button mat-flat-button type="submit" [disabled]="form.invalid">{{ data.conversion ? 'Convertir en venta' : 'Registrar' }}</button></mat-dialog-actions></form>`})
export class ReservaPagoDialogComponent { private readonly fb=inject(FormBuilder); readonly ref=inject(MatDialogRef<ReservaPagoDialogComponent>); readonly data=inject<{title:string;maximo:number;conversion?:boolean}>(MAT_DIALOG_DATA); readonly form=this.fb.nonNullable.group({monto:[this.data.maximo,[Validators.required,Validators.min(0.01),Validators.max(this.data.maximo)]],metodoPago:['efectivo' as MetodoPago,Validators.required],notas:['']}); save():void { if(this.form.invalid)return; const raw=this.form.getRawValue(); this.ref.close({monto:Number(raw.monto),metodoPago:raw.metodoPago,fecha:new Date().toISOString(),notas:raw.notas||undefined} satisfies ReservaPago); } }
