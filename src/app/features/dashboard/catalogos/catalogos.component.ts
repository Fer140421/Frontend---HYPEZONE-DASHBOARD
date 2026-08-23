import { AsyncPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PageEvent, MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, startWith, take } from 'rxjs';
import { Categoria, categoriasIniciales } from '../../../core/models/catalogo.model';
import { CategoriaRepository } from '../../../core/repositories/categoria.repository';
import { ProductoRepository } from '../../../core/repositories/producto.repository';
import { Producto } from '../../../core/models/producto.model';
import { AuthService } from '../../../core/services/auth.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { FilterDrawerComponent } from '../../../shared/components/filter-drawer/filter-drawer.component';

type EstadoCategoriaFiltro = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-catalogos',
  standalone: true,
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    MatSelectModule,
    EmptyStateComponent,
    FilterDrawerComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.css',
})
export class CatalogosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly categorias = inject(CategoriaRepository);
  private readonly productos = inject(ProductoRepository);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly viewType = inject(ViewPreferenceService).getViewSignal('categorias', 'cards');
  readonly filtersOpen = signal(false);
  readonly filters = this.fb.nonNullable.group({
    search: [''],
    estado: ['activos' as EstadoCategoriaFiltro],
  });
  private readonly appliedFilters$ = new BehaviorSubject<EstadoCategoriaFiltro>('activos');
  private readonly categoriasSource$ = this.categorias.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly categorias$ = this.categoriasSource$;
  readonly listViewModel$ = combineLatest([
    this.categoriasSource$,
    this.filters.controls.search.valueChanges.pipe(startWith(this.filters.controls.search.getRawValue())),
    this.appliedFilters$,
    this.pagination$,
  ]).pipe(
    map(([categorias, searchValue, estado, pagination]) => {
      const search = searchValue.trim().toLocaleLowerCase();
      const filtradas = categorias.filter((categoria) =>
        (!search || categoria.nombre.toLocaleLowerCase().includes(search)) &&
        (estado === 'todos' || (estado === 'activos' ? categoria.activo !== false : categoria.activo === false)),
      );
      return { categorias: paginateItems(filtradas, pagination) };
    }),
  );

  ngOnInit(): void {
    void this.initializeCatalogs();
  }

  openCreate(): void {
    if (!this.auth.can('catalogs.create')) return;
    this.dialog
      .open(CategoriaDialogComponent, {
        width: '420px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Categoría registrada correctamente.');
        }
      });
  }

  openEdit(categoria: Categoria): void {
    if (!this.auth.can('catalogs.update')) return;
    this.dialog
      .open(CategoriaDialogComponent, {
        width: '420px',
        data: categoria,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Categoría actualizada correctamente.');
        }
      });
  }

  async removeCategoria(categoria: Categoria): Promise<void> {
    if (!this.auth.can('catalogs.delete')) return;
    try {
      const [productos, categoriasDestino] = await Promise.all([
        firstValueFrom(this.productos.getAll(true).pipe(take(1))),
        firstValueFrom(this.categorias.getAll().pipe(take(1))),
      ]);
      const asociados = productos.filter((producto) => producto.categoria === categoria.nombre);

      if (!asociados.length) {
        await this.categorias.delete(categoria.id!);
        this.message('Categoría eliminada.');
        return;
      }

      if (!this.auth.can('products.update')) {
        this.message('Necesitas permiso para editar productos y reasignar esta categoría.');
        return;
      }

      const destinos = categoriasDestino.filter((item) => item.id !== categoria.id);
      if (!destinos.length) {
        this.message('Crea otra categoría antes de eliminar esta, porque tiene productos asociados.');
        return;
      }

      this.dialog
        .open(CategoriaTransferDialogComponent, {
          width: 'min(720px, 96vw)',
          maxHeight: '90vh',
          data: { categoria, productos: asociados, destinos },
        })
        .afterClosed()
        .subscribe(async (asignaciones?: Record<string, string[]>) => {
          if (!asignaciones) return;
          try {
            await Promise.all(
              Object.entries(asignaciones).map(([destino, ids]) =>
                this.productos.reasignarCategoria(ids, destino),
              ),
            );
            await this.categorias.delete(categoria.id!);
            this.message(`Categoría eliminada y ${asociados.length} producto(s) reasignado(s).`);
          } catch (error) {
            this.message(error instanceof Error ? error.message : 'No se pudo reasignar los productos.');
          }
        });
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo eliminar la categoría.');
    }
  }

  async restoreCategoria(categoria: Categoria): Promise<void> {
    if (!this.auth.can('catalogs.delete') || !categoria.id || categoria.activo !== false) return;
    try {
      await this.categorias.activate(categoria.id);
      this.message('Categoría activada.');
    } catch (error) {
      this.message(error instanceof Error ? error.message : 'No se pudo activar la categoría.');
    }
  }

  openFilters(): void {
    this.filters.patchValue({ estado: this.appliedFilters$.value }, { emitEvent: false });
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    this.appliedFilters$.next(this.filters.controls.estado.getRawValue());
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private async initializeCatalogs(): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    try {
      const categorias = await firstValueFrom(this.categorias.getAll(true).pipe(take(1)));
      if (!categorias.length) {
        await Promise.all(categoriasIniciales.map((nombre) => this.categorias.create({ nombre })));
      }
    } catch {
      this.message('No se pudieron inicializar las categorías.');
    }
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2500 });
  }
}

@Component({
  selector: 'app-categoria-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './categoria-dialog.html',
  styleUrl: './catalogos.css',
})
export class CategoriaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(CategoriaRepository);
  private readonly dialogRef = inject(MatDialogRef<CategoriaDialogComponent>);
  readonly data = inject<Categoria | null>(MAT_DIALOG_DATA, { optional: true });

  readonly isEdit = !!this.data?.id;
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: [this.data?.nombre ?? '', [Validators.required]],
  });

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.errorMessage.set(null);

    const nombre = this.form.getRawValue().nombre.trim();
    if (!nombre) return;

    this.saving.set(true);

    try {
      const items = await firstValueFrom(this.repository.getAll(true).pipe(take(1)));
      const duplicate = items.some(
        (item) =>
          item.nombre.toLowerCase() === nombre.toLowerCase() &&
          (!this.isEdit || item.id !== this.data?.id)
      );

      if (duplicate) {
        this.errorMessage.set('Esa categoría ya existe.');
        this.saving.set(false);
        return;
      }

      if (this.isEdit && this.data?.id) {
        await this.repository.update(this.data.id, { nombre });
      } else {
        await this.repository.create({ nombre });
      }

      this.saving.set(false);
      this.dialogRef.close(true);
    } catch {
      this.errorMessage.set('Ocurrió un error al guardar la categoría.');
      this.saving.set(false);
    }
  }
}

interface CategoriaTransferDialogData {
  categoria: Categoria;
  productos: Producto[];
  destinos: Categoria[];
}

@Component({
  selector: 'app-categoria-transfer-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './categoria-transfer-dialog.html',
  styleUrl: './categoria-transfer-dialog.css',
})
export class CategoriaTransferDialogComponent {
  readonly data = inject<CategoriaTransferDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CategoriaTransferDialogComponent>);
  readonly destinoGeneral = signal('');
  readonly destinosIndividuales = signal<Record<string, string>>({});

  seleccionarDestinoGeneral(destino: string): void {
    this.destinoGeneral.set(destino);
  }

  seleccionarDestinoProducto(productoId: string, destino: string): void {
    this.destinosIndividuales.update((actuales) => ({ ...actuales, [productoId]: destino }));
  }

  destinoDe(producto: Producto): string {
    return this.destinosIndividuales()[producto.id!] || this.destinoGeneral();
  }

  confirmar(): void {
    if (!this.destinoGeneral()) return;
    const asignaciones: Record<string, string[]> = {};
    for (const producto of this.data.productos) {
      const destino = this.destinoDe(producto);
      if (!destino || !producto.id) return;
      (asignaciones[destino] ??= []).push(producto.id);
    }
    this.dialogRef.close(asignaciones);
  }
}
