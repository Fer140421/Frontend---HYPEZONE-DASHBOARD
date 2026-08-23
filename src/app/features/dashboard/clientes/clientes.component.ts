import { AsyncPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, startWith, take } from 'rxjs';
import { Cliente, normalizeCliente } from '../../../core/models/cliente.model';
import { ClienteRepository } from '../../../core/repositories/cliente.repository';
import { AuthService } from '../../../core/services/auth.service';
import {
  formatInternationalPhone,
  SOUTH_AMERICAN_COUNTRIES,
  splitPhoneNumber,
  whatsappUrl,
} from '../../../core/utils/phone.util';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
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

export interface ClienteFormDialogData {
  cliente?: Cliente;
  deferred?: boolean;
}

type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-clientes',
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
    FilterDrawerComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './clientes.html',
  styleUrl: './clientes.css',
})
export class ClientesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly clientes = inject(ClienteRepository);
  readonly auth = inject(AuthService);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly viewType = inject(ViewPreferenceService).getViewSignal('clientes', 'table');
  readonly filtersOpen = signal(false);
  get columns(): string[] {
    const base = ['nombreCompleto', 'celular', 'ci', 'puntos', 'estado'];
    return this.auth.canAny(['clients.update', 'clients.delete']) ? [...base, 'acciones'] : base;
  }
  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly filters = this.fb.nonNullable.group({
    nombre: [''],
    celular: [''],
    ci: [''],
    estado: ['activos' as EstadoFiltro],
  });
  private readonly appliedFilters$ = new BehaviorSubject({
    celular: '',
    ci: '',
    estado: 'activos' as EstadoFiltro,
  });
  readonly clientes$ = this.clientes.getAll(true).pipe(
    map((items) => [...items].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly filtered$ = combineLatest([
    this.clientes$,
    this.filters.controls.nombre.valueChanges.pipe(startWith(this.filters.controls.nombre.getRawValue())),
    this.appliedFilters$,
  ]).pipe(
    map(([items, nombreValue, filters]) => {
      const nombre = nombreValue.toLowerCase().trim();
      const celular = filters.celular.toLowerCase().trim();
      const ci = filters.ci.toLowerCase().trim();
      return items.filter((item) => {
        const estado =
          filters.estado === 'todos'
            ? true
            : filters.estado === 'activos'
              ? item.activo !== false
              : item.activo === false;
        const matchesNombre = !nombre || item.nombreCompleto.toLowerCase().includes(nombre);
        const matchesCelular = !celular || item.celular.toLowerCase().includes(celular);
        const matchesCi = !ci || (item.ci ?? '').toLowerCase().includes(ci);
        return estado && matchesNombre && matchesCelular && matchesCi;
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly listViewModel$ = combineLatest([this.filtered$, this.pagination$]).pipe(
    map(([items, pagination]) => ({ clientes: paginateItems(items, pagination) })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  ngOnInit(): void {
    this.filters.controls.nombre.valueChanges.subscribe(() =>
      this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize }),
    );
  }

  openFilters(): void {
    this.filters.patchValue(this.appliedFilters$.value, { emitEvent: false });
    this.filtersOpen.set(true);
  }

  applyFilters(): void {
    const { celular, ci, estado } = this.filters.getRawValue();
    this.appliedFilters$.next({ celular, ci, estado });
    this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize });
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  whatsappLink(celular: string | undefined): string | null {
    return whatsappUrl(celular);
  }

  openCreate(): void {
    if (!this.auth.can('clients.create')) return;
    this.dialog
      .open(ClienteFormDialogComponent, {
        width: 'min(560px, 96vw)',
        maxHeight: '90vh',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Cliente registrado.');
        }
      });
  }

  openEdit(cliente: Cliente): void {
    if (!this.auth.can('clients.update')) return;
    this.dialog
      .open(ClienteFormDialogComponent, {
        width: 'min(560px, 96vw)',
        maxHeight: '90vh',
        data: cliente,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Cliente actualizado.');
        }
      });
  }

  confirmDelete(cliente: Cliente): void {
    if (!this.auth.can('clients.delete') || !cliente.id) {
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar cliente',
          message: `Se desactivará a "${cliente.nombreCompleto}" sin borrar su historial.`,
          confirmText: 'Eliminar',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        await this.clientes.delete(cliente.id!);
        this.message('Cliente desactivado.');
      });
  }

  confirmRestore(cliente: Cliente): void {
    if (!this.auth.can('clients.delete') || !cliente.id) {
      return;
    }
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Reactivar cliente',
          message: `Se reactivará a "${cliente.nombreCompleto}".`,
          confirmText: 'Reactivar',
        },
      })
      .afterClosed()
      .subscribe(async (confirmed) => {
        if (!confirmed) {
          return;
        }
        await this.clientes.activate(cliente.id!);
        this.message('Cliente reactivado.');
      });
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2600 });
  }
}

@Component({
  selector: 'app-cliente-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './cliente-form-dialog.html',
  styleUrl: './clientes.css',
})
export class ClienteFormDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(ClienteRepository);
  private readonly auth = inject(AuthService);
  private readonly ref = inject(MatDialogRef<ClienteFormDialogComponent>);
  private readonly dialogData = inject<Cliente | ClienteFormDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  readonly data = this.readCliente(this.dialogData);
  readonly deferred = this.isDialogData(this.dialogData) && this.dialogData.deferred === true;
  readonly countries = SOUTH_AMERICAN_COUNTRIES;
  readonly saving = signal(false);
  private readonly phone = splitPhoneNumber(this.data?.celular);
  readonly form = this.fb.nonNullable.group({
    nombreCompleto: [this.data?.nombreCompleto ?? '', Validators.required],
    codigoPais: [this.phone.countryCode, Validators.required],
    celular: [this.phone.localNumber, [Validators.required, Validators.pattern(/^\d[\d\s-]*$/)]],
    ci: [this.data?.ci ?? ''],
  });

  async save(): Promise<void> {
    if (this.form.invalid || this.saving() || (this.data?.id ? !this.auth.can('clients.update') : !this.auth.can('clients.create'))) {
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const payload: Partial<Cliente> = {
      nombreCompleto: raw.nombreCompleto.trim(),
      celular: formatInternationalPhone(raw.codigoPais, raw.celular),
      ci: raw.ci.trim() || undefined,
      schemaVersion: 1,
      activo: this.data?.activo ?? true,
    };

    const duplicates = await firstValueFrom(this.repository.getAll(true).pipe(take(1)));
    const duplicate = duplicates.find((item) => {
      if (item.id === this.data?.id) {
        return false;
      }
      const sameName = item.nombreCompleto.trim().toLowerCase() === payload.nombreCompleto?.toLowerCase();
      const sameCi = !!payload.ci && (item.ci ?? '').trim().toLowerCase() === payload.ci.toLowerCase();
      return sameName || sameCi;
    });
    if (duplicate) {
      this.saving.set(false);
      return;
    }

    if (this.deferred) {
      this.ref.close(normalizeCliente({
        nombreCompleto: payload.nombreCompleto!,
        celular: payload.celular!,
        ci: payload.ci,
        schemaVersion: 1,
        activo: true,
      }));
      return;
    }

    if (this.data?.id) {
      await this.repository.update(this.data.id, payload);
    } else {
      await this.repository.create(payload);
    }
    this.ref.close(true);
  }

  private isDialogData(value: Cliente | ClienteFormDialogData | null): value is ClienteFormDialogData {
    return !!value && ('deferred' in value || 'cliente' in value);
  }

  private readCliente(value: Cliente | ClienteFormDialogData | null): Cliente | null {
    if (!value) {
      return null;
    }
    return this.isDialogData(value) ? value.cliente ?? null : value;
  }
}
