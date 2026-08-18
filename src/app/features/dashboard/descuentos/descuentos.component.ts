import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, firstValueFrom, map, of, shareReplay, switchMap } from 'rxjs';
import { Descuento, TipoDescuento } from '../../../core/models/descuento.model';
import { Producto, precioProducto } from '../../../core/models/producto.model';
import { DescuentoRepository } from '../../../core/repositories/descuento.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, PaginationState, paginateItems } from '../../../shared/utils/pagination.util';

@Component({
  selector: 'app-descuentos', standalone: true,
  imports: [AsyncPipe, CurrencyPipe, RouterLink, MatButtonModule, MatCardModule, MatDialogModule,
    MatIconModule, MatPaginatorModule, MatSnackBarModule, MatTableModule, EmptyStateComponent, LoadingComponent, PageHeaderComponent],
  templateUrl: './descuentos.html', styleUrl: './descuentos.css',
})
export class DescuentosComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly descuentos = inject(DescuentoRepository);
  private readonly productos = inject(ProductoRepository);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly selectedDiscount = signal<Descuento | null>(null);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly viewType = inject(ViewPreferenceService).getViewSignal('descuentos', 'table');
  private readonly productos$ = this.productos.getAll(true).pipe(shareReplay({ bufferSize: 1, refCount: true }));
  private readonly campaigns$ = this.descuentos.getAll(true).pipe(
    catchError(() => { this.listError.set('No se pudieron cargar los descuentos. Verifica que las reglas de Firestore estén desplegadas.'); return of([] as Descuento[]); }),
  );
  readonly listViewModel$ = combineLatest([this.campaigns$, this.productos$, this.pagination$]).pipe(
    map(([descuentos, productos, pagination]) => paginateItems(descuentos.map((descuento) => ({
      ...descuento,
      cantidadProductos: productos.filter((producto) => producto.activo !== false && producto.descuentoId === descuento.id).length,
    })), pagination)),
  );
  readonly detailProductos$ = combineLatest([this.productos$, this.route.paramMap]).pipe(
    map(([productos, params]) => productos.filter((producto) => producto.descuentoId === params.get('id'))),
  );

  constructor() {
    this.route.paramMap.pipe(
      switchMap((params) => params.get('id') ? this.descuentos.getById(params.get('id')!) : [null]),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((descuento) => this.selectedDiscount.set(descuento ?? null));
  }

  async nuevo(): Promise<void> {
    const productos = await firstValueFrom(this.productos$.pipe(map((items) => items.filter((item) => item.estado === 'disponible' && item.activo !== false))));
    const result = await this.dialog.open(DescuentoDialogComponent, { width: 'min(1280px, 98vw)', maxHeight: '92vh', data: { productos } }).afterClosed().toPromise();
    if (!result) return;
    this.loading.set(true);
    try {
      const id = await this.descuentos.crearConProductos(result.descuento, result.productos);
      this.snack.open('Descuento creado.', 'Cerrar', { duration: 3000 });
      await this.router.navigate(['/dashboard/descuentos', id]);
    } catch (error) { this.showError(error); } finally { this.loading.set(false); }
  }

  async agregarProductos(): Promise<void> {
    const descuento = this.selectedDiscount();
    if (!descuento) return;
    const productos = await firstValueFrom(this.productos$.pipe(map((items) => items.filter((item) => item.estado === 'disponible' && item.activo !== false && !item.descuentoId))));
    const result = await this.dialog.open(DescuentoDialogComponent, { width: 'min(1280px, 98vw)', maxHeight: '92vh', data: { productos, descuento } }).afterClosed().toPromise();
    if (!result?.productos?.length) return;
    this.loading.set(true);
    try { await this.descuentos.agregarProductos(descuento, result.productos); this.snack.open('Productos asociados.', 'Cerrar', { duration: 3000 }); }
    catch (error) { this.showError(error); } finally { this.loading.set(false); }
  }

  quitarProducto(producto: Producto): void {
    const descuento = this.selectedDiscount();
    if (!descuento || !producto.id) return;
    this.dialog.open(ConfirmDialogComponent, { data: { title: 'Quitar producto', message: `Se quitará "${producto.nombre}" de ${descuento.nombre} y perderá su oferta.`, confirmText: 'Quitar' } })
      .afterClosed().subscribe(async (confirmed) => {
        if (!confirmed) return;
        try { await this.descuentos.quitarProducto(descuento.id!, producto.id!); this.snack.open('Producto quitado del descuento.', 'Cerrar', { duration: 3000 }); }
        catch (error) { this.showError(error); }
      });
  }

  async editar(): Promise<void> {
    const descuento = this.selectedDiscount();
    if (!descuento) return;
    const input = await this.dialog.open(DescuentoEditDialogComponent, { width: 'min(560px, 94vw)', data: descuento }).afterClosed().toPromise();
    if (!input) return;
    this.loading.set(true);
    try {
      const products = await firstValueFrom(this.productos$.pipe(map((items) => items.filter((item) => item.descuentoId === descuento.id))));
      await this.descuentos.actualizarDescuento(descuento, input, products);
      this.snack.open('Descuento actualizado y ofertas recalculadas.', 'Cerrar', { duration: 3500 });
    } catch (error) { this.showError(error); } finally { this.loading.set(false); }
  }

  finalizar(): void { this.cerrarCampana(false); }
  eliminar(): void { this.cerrarCampana(true); }

  private cerrarCampana(eliminar: boolean): void {
    const descuento = this.selectedDiscount();
    if (!descuento?.id) return;
    const action = eliminar ? 'Eliminar' : 'Finalizar';
    const message = eliminar
      ? `Se eliminará "${descuento.nombre}" y se quitarán sus ofertas de todos los productos asociados.`
      : `Se finalizará "${descuento.nombre}". Quedará como historial, pero sus productos perderán la oferta.`;
    this.dialog.open(ConfirmDialogComponent, { data: { title: `${action} descuento`, message, confirmText: action } })
      .afterClosed().subscribe(async (confirmed) => {
        if (!confirmed) return;
        this.loading.set(true);
        try {
          const products = await firstValueFrom(this.productos$.pipe(map((items) => items.filter((item) => item.descuentoId === descuento.id))));
          const ids = products.map((item) => item.id!).filter(Boolean);
          if (eliminar) await this.descuentos.eliminar(descuento.id!, ids);
          else await this.descuentos.finalizar(descuento.id!, ids);
          this.snack.open(eliminar ? 'Descuento eliminado.' : 'Descuento finalizado.', 'Cerrar', { duration: 3500 });
          await this.router.navigate(['/dashboard/descuentos']);
        } catch (error) { this.showError(error); } finally { this.loading.set(false); }
      });
  }

  oferta(producto: Producto): number { return Number(producto.precioOferta ?? precioProducto(producto)); }
  descuentoLabel(descuento: Descuento): string { return descuento.tipo === 'porcentaje' ? `${descuento.valor}% de descuento` : `Precio final Bs ${descuento.valor}`; }
  updatePage(event: PageEvent): void { this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize }); }
  private showError(error: unknown): void { this.snack.open(error instanceof Error ? error.message : 'No se pudo completar la operación.', 'Cerrar', { duration: 5000 }); }
}

interface DescuentoDialogData { productos: Producto[]; descuento?: Descuento; }
@Component({
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.descuento ? 'Agregar productos a ' + data.descuento.nombre : 'Nuevo descuento' }}</h2>
    <mat-dialog-content>
      @if (!data.descuento) { <form [formGroup]="form" class="discount-form"><mat-form-field appearance="outline"><mat-label>Nombre del descuento</mat-label><input matInput formControlName="nombre" placeholder="Ej. Descuentos de verano" /></mat-form-field><mat-form-field appearance="outline"><mat-label>Tipo</mat-label><mat-select formControlName="tipo"><mat-option value="porcentaje">Porcentaje</mat-option><mat-option value="precio">Precio final fijo</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>{{ form.controls.tipo.value === 'porcentaje' ? 'Descuento (%)' : 'Precio final (Bs)' }}</mat-label><input matInput type="number" min="0.01" formControlName="valor" /></mat-form-field></form> }
      <mat-form-field appearance="outline" class="search"><mat-label>Buscar productos</mat-label><input matInput [value]="search()" (input)="search.set($any($event.target).value)" /></mat-form-field>
      <div class="dialog-selection"><mat-checkbox [checked]="allSelected()" (change)="toggleAll($event.checked)">Seleccionar resultados</mat-checkbox><span>{{ selected().size }} seleccionados</span></div>
      <div class="dialog-products">@for (producto of filtered(); track producto.id) { <label><mat-checkbox [checked]="selected().has(producto.id!)" (change)="toggle(producto, $event.checked)" />@if (image(producto); as src) { <img class="dialog-product-thumb" [src]="src" [alt]="producto.nombre" loading="lazy" decoding="async" /> } @else { <span class="dialog-product-thumb placeholder">Sin foto</span> }<span><strong>{{ producto.nombre }}</strong><small>{{ producto.marca || 'Sin marca' }} · {{ producto.precioVenta | currency:'BOB':'symbol-narrow' }}</small></span></label> } @empty { <p>No hay productos disponibles.</p> }</div>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cancelar</button><button mat-flat-button (click)="save()">{{ data.descuento ? 'Agregar productos' : 'Crear descuento' }}</button></mat-dialog-actions>`,
  styles: [`.discount-form{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}.search{width:100%;margin-top:10px}.dialog-selection{display:flex;justify-content:space-between;margin:4px 0 10px}.dialog-products{max-height:480px;overflow:auto;border:1px solid var(--mat-sys-outline-variant);border-radius:8px}.dialog-products label{display:flex;align-items:center;gap:12px;padding:9px;border-bottom:1px solid var(--mat-sys-outline-variant)}.dialog-products small{display:block;color:var(--mat-sys-on-surface-variant)}.dialog-product-thumb{width:54px;height:54px;border-radius:7px;object-fit:cover;background:var(--mat-sys-surface-container);flex:none}.dialog-product-thumb.placeholder{display:grid;place-items:center;font-size:.7rem;color:var(--mat-sys-on-surface-variant)}@media(max-width:700px){.discount-form{grid-template-columns:1fr}}`],
})
export class DescuentoDialogComponent {
  readonly data = inject<DescuentoDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DescuentoDialogComponent>);
  private readonly fb = inject(FormBuilder);
  readonly search = signal(''); readonly selected = signal(new Set<string>());
  readonly form = this.fb.nonNullable.group({ nombre: ['', Validators.required], tipo: ['porcentaje' as TipoDescuento], valor: [10, [Validators.required, Validators.min(0.01)]] });
  filtered(): Producto[] { const query = this.search().toLowerCase().trim(); return this.data.productos.filter((p) => !query || [p.nombre, p.marca, p.codigo].some((value) => value?.toLowerCase().includes(query))); }
  image(producto: Producto): string { return cloudinaryThumbnailUrl(producto.imagenes[0] ?? ''); }
  allSelected(): boolean { const items = this.filtered(); return !!items.length && items.every((p) => this.selected().has(p.id!)); }
  toggle(producto: Producto, checked: boolean): void { this.selected.update((current) => { const next = new Set(current); checked ? next.add(producto.id!) : next.delete(producto.id!); return next; }); }
  toggleAll(checked: boolean): void { this.selected.update((current) => { const next = new Set(current); this.filtered().forEach((p) => checked ? next.add(p.id!) : next.delete(p.id!)); return next; }); }
  save(): void {
    const productos = this.data.productos.filter((p) => p.id && this.selected().has(p.id));
    if (!productos.length || (!this.data.descuento && (this.form.invalid || (this.form.controls.tipo.value === 'porcentaje' && this.form.controls.valor.value >= 100)))) return;
    this.ref.close({ productos, descuento: this.form.getRawValue() });
  }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `<h2 mat-dialog-title>Editar descuento</h2><mat-dialog-content><form [formGroup]="form" class="edit-discount-form"><mat-form-field appearance="outline"><mat-label>Nombre</mat-label><input matInput formControlName="nombre" /></mat-form-field><mat-form-field appearance="outline"><mat-label>Tipo</mat-label><mat-select formControlName="tipo"><mat-option value="porcentaje">Porcentaje</mat-option><mat-option value="precio">Precio final fijo</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>{{ form.controls.tipo.value === 'porcentaje' ? 'Descuento (%)' : 'Precio final (Bs)' }}</mat-label><input matInput type="number" min="0.01" formControlName="valor" /></mat-form-field></form></mat-dialog-content><mat-dialog-actions align="end"><button mat-button mat-dialog-close>Cancelar</button><button mat-flat-button [disabled]="form.invalid" (click)="save()">Guardar cambios</button></mat-dialog-actions>`,
  styles: [`.edit-discount-form{display:grid;gap:10px}.edit-discount-form mat-form-field{width:100%}`],
})
export class DescuentoEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ref = inject(MatDialogRef<DescuentoEditDialogComponent>);
  readonly data = inject<Descuento>(MAT_DIALOG_DATA);
  readonly form = this.fb.nonNullable.group({ nombre: [this.data.nombre, Validators.required], tipo: [this.data.tipo], valor: [this.data.valor, [Validators.required, Validators.min(0.01)]] });
  save(): void { const value = this.form.getRawValue(); if (this.form.invalid || (value.tipo === 'porcentaje' && value.valor >= 100)) return; this.ref.close(value); }
}
