import { AsyncPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, startWith, take } from 'rxjs';
import { Proveedor } from '../../../core/models/proveedor.model';
import { ProveedorRepository } from '../../../core/repositories/proveedor.repository';
import { AuthService } from '../../../core/services/auth.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
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

type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-proveedores',
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
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    EmptyStateComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.css',
})
export class ProveedoresComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly proveedores = inject(ProveedorRepository);
  readonly auth = inject(AuthService);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  get columns(): string[] {
    const base = ['nombreCompleto', 'celular', 'categorias', 'redes', 'estado'];
    return this.auth.canAny(['providers.update', 'providers.delete']) ? [...base, 'acciones'] : base;
  }
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly viewType = inject(ViewPreferenceService).getViewSignal('proveedores', 'table');
  readonly filters = this.fb.nonNullable.group({
    nombre: [''],
    categoria: [''],
    estado: ['activos' as EstadoFiltro],
  });
  readonly proveedores$ = this.proveedores.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly categorias$ = this.proveedores$.pipe(
    map((items) =>
      [...new Set(items.flatMap((item) => item.categorias).map((item) => item.trim()).filter(Boolean))].sort(),
    ),
  );
  readonly filtered$ = combineLatest([
    this.proveedores$,
    this.filters.valueChanges.pipe(startWith(this.filters.getRawValue())),
  ]).pipe(
    map(([items, filters]) => {
      const nombre = (filters.nombre ?? '').toLowerCase().trim();
      const categoria = (filters.categoria ?? '').toLowerCase().trim();
      const estado = filters.estado;
      return items.filter((item) => {
        const matchesEstado =
          estado === 'todos'
            ? true
            : estado === 'activos'
              ? item.activo !== false
              : item.activo === false;
        const matchesNombre =
          !nombre ||
          [item.nombreCompleto, item.direccion, item.celular, item.instagram, item.tiktok]
            .some((value) => (value ?? '').toLowerCase().includes(nombre));
        const matchesCategoria =
          !categoria || item.categorias.some((value) => value.toLowerCase().includes(categoria));
        return matchesEstado && matchesNombre && matchesCategoria;
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly listViewModel$ = combineLatest([this.filtered$, this.pagination$]).pipe(
    map(([items, pagination]) => ({ proveedores: paginateItems(items, pagination) })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  ngOnInit(): void {
    this.filters.valueChanges.subscribe(() =>
      this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize }),
    );
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  openCreate(): void {
    if (!this.auth.can('providers.create')) return;
    this.dialog
      .open(ProveedorFormDialogComponent, {
        width: 'min(760px, 96vw)',
        maxHeight: '92vh',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Proveedor registrado.');
        }
      });
  }

  openEdit(proveedor: Proveedor): void {
    if (!this.auth.can('providers.update')) return;
    this.dialog
      .open(ProveedorFormDialogComponent, {
        width: 'min(760px, 96vw)',
        maxHeight: '92vh',
        data: proveedor,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Proveedor actualizado.');
        }
      });
  }

  confirmDelete(proveedor: Proveedor): void {
    if (!this.auth.can('providers.delete') || !proveedor.id) {
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar proveedor',
          message: `Se desactivará a "${proveedor.nombreCompleto}" sin borrar su historial.`,
          confirmText: 'Eliminar',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        await this.proveedores.delete(proveedor.id!);
        this.message('Proveedor desactivado.');
      });
  }

  confirmRestore(proveedor: Proveedor): void {
    if (!this.auth.can('providers.delete') || !proveedor.id) {
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Reactivar proveedor',
          message: `Se reactivará a "${proveedor.nombreCompleto}".`,
          confirmText: 'Reactivar',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        await this.proveedores.activate(proveedor.id!);
        this.message('Proveedor reactivado.');
      });
  }

  categoriesLabel(proveedor: Proveedor): string {
    return proveedor.categorias.length ? proveedor.categorias.join(', ') : 'Sin categorias';
  }

  redesLabel(proveedor: Proveedor): string {
    return [proveedor.instagram && `IG: ${proveedor.instagram}`, proveedor.tiktok && `TT: ${proveedor.tiktok}`]
      .filter(Boolean)
      .join(' · ') || 'Sin redes';
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2600 });
  }
}

@Component({
  selector: 'app-proveedor-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './proveedor-form-dialog.html',
  styleUrl: './proveedores.css',
})
export class ProveedorFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(ProveedorRepository);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<ProveedorFormDialogComponent>);
  readonly data = inject<Proveedor | null>(MAT_DIALOG_DATA, { optional: true }) ?? null;
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombreCompleto: [this.data?.nombreCompleto ?? '', Validators.required],
    direccion: [this.data?.direccion ?? ''],
    celular: [this.data?.celular ?? '', Validators.required],
    categoriaNueva: [''],
    categorias: this.fb.array(
      (this.data?.categorias ?? []).map((item) => this.fb.nonNullable.control(item, Validators.required)),
    ),
    instagram: [this.data?.instagram ?? ''],
    tiktok: [this.data?.tiktok ?? ''],
    detalles: [this.data?.detalles ?? ''],
  });

  get categorias(): FormArray {
    return this.form.controls.categorias;
  }

  addCategoria(): void {
    const value = this.form.controls.categoriaNueva.getRawValue().trim();
    if (!value) {
      return;
    }
    const exists = this.categorias.controls.some(
      (control) => control.getRawValue().toLowerCase() === value.toLowerCase(),
    );
    if (exists) {
      return;
    }
    this.categorias.push(this.fb.nonNullable.control(value, Validators.required));
    this.form.controls.categoriaNueva.reset('');
  }

  removeCategoria(index: number): void {
    this.categorias.removeAt(index);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving() || (this.data?.id ? !this.auth.can('providers.update') : !this.auth.can('providers.create'))) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload: Partial<Proveedor> = {
      nombreCompleto: raw.nombreCompleto.trim(),
      direccion: raw.direccion.trim() || undefined,
      celular: raw.celular.trim(),
      categorias: raw.categorias.map((item) => item.trim()).filter(Boolean),
      instagram: raw.instagram.trim() || undefined,
      tiktok: raw.tiktok.trim() || undefined,
      detalles: raw.detalles.trim() || undefined,
      schemaVersion: 1,
      activo: this.data?.activo ?? true,
    };

    const duplicates = await firstValueFrom(this.repository.getAll(true).pipe(take(1)));
    const duplicate = duplicates.find(
      (item) =>
        item.id !== this.data?.id &&
        item.nombreCompleto.trim().toLowerCase() === payload.nombreCompleto?.toLowerCase(),
    );
    if (duplicate) {
      this.saving.set(false);
      return;
    }

    if (this.data?.id) {
      await this.repository.update(this.data.id, payload);
    } else {
      await this.repository.create(payload);
    }
    this.ref.close(true);
  }
}
