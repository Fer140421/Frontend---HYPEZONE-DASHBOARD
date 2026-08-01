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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject, combineLatest, firstValueFrom, map, take } from 'rxjs';
import { Talla, tallasIniciales } from '../../../core/models/catalogo.model';
import { TallaRepository } from '../../../core/repositories/talla.repository';
import { AuthService } from '../../../core/services/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';

@Component({
  selector: 'app-tallas',
  standalone: true,
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatSnackBarModule,
    EmptyStateComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './tallas.html',
  styleUrl: './tallas.css',
})
export class TallasComponent implements OnInit {
  private readonly tallas = inject(TallaRepository);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly tallas$ = this.tallas.getAll().pipe(map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  readonly listViewModel$ = combineLatest([this.tallas$, this.pagination$]).pipe(
    map(([tallas, pagination]) => ({ tallas: paginateItems(tallas, pagination) })),
  );

  ngOnInit(): void {
    void this.initializeCatalogs();
  }

  openCreate(): void {
    if (!this.auth.can('catalogs.create')) return;
    this.dialog
      .open(TallaDialogComponent, {
        width: '420px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Talla registrada correctamente.');
        }
      });
  }

  openEdit(talla: Talla): void {
    if (!this.auth.can('catalogs.update')) return;
    this.dialog
      .open(TallaDialogComponent, {
        width: '420px',
        data: talla,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Talla actualizada correctamente.');
        }
      });
  }

  async removeTalla(id: string): Promise<void> {
    if (!this.auth.can('catalogs.delete')) return;
    await this.tallas.delete(id);
    this.message('Talla eliminada.');
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private async initializeCatalogs(): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    try {
      const tallas = await firstValueFrom(this.tallas.getAll(true).pipe(take(1)));
      if (!tallas.length) {
        await Promise.all(tallasIniciales.map((nombre) => this.tallas.create({ nombre })));
      }
    } catch {
      this.message('No se pudieron inicializar las tallas.');
    }
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2500 });
  }
}

@Component({
  selector: 'app-talla-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './talla-dialog.html',
  styleUrl: './tallas.css',
})
export class TallaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(TallaRepository);
  private readonly dialogRef = inject(MatDialogRef<TallaDialogComponent>);
  readonly data = inject<Talla | null>(MAT_DIALOG_DATA, { optional: true });

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
        this.errorMessage.set('Esa talla ya existe.');
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
      this.errorMessage.set('Ocurrió un error al guardar la talla.');
      this.saving.set(false);
    }
  }
}
