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
import { Categoria, categoriasIniciales } from '../../../core/models/catalogo.model';
import { CategoriaRepository } from '../../../core/repositories/categoria.repository';
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

@Component({
  selector: 'app-catalogos',
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
  templateUrl: './catalogos.html',
  styleUrl: './catalogos.css',
})
export class CatalogosComponent implements OnInit {
  private readonly categorias = inject(CategoriaRepository);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly viewType = inject(ViewPreferenceService).getViewSignal('categorias', 'cards');
  readonly categorias$ = this.categorias.getAll().pipe(map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  readonly listViewModel$ = combineLatest([this.categorias$, this.pagination$]).pipe(
    map(([categorias, pagination]) => ({ categorias: paginateItems(categorias, pagination) })),
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

  async removeCategoria(id: string): Promise<void> {
    if (!this.auth.can('catalogs.delete')) return;
    await this.categorias.delete(id);
    this.message('Categoría eliminada.');
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
