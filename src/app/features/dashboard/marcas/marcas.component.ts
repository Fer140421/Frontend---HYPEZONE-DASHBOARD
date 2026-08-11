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
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, combineLatest, firstValueFrom, map, take } from 'rxjs';
import { Marca, marcaImagen, marcasIniciales } from '../../../core/models/catalogo.model';
import { MarcaRepository } from '../../../core/repositories/marca.repository';
import { AuthService } from '../../../core/services/auth.service';
import { ViewPreferenceService } from '../../../core/services/view-preference.service';
import { cloudinaryThumbnailUrl } from '../../../core/utils/cloudinary-image.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImageUploaderComponent } from '../../../shared/components/image-uploader/image-uploader.component';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  PaginationState,
  paginateItems,
} from '../../../shared/utils/pagination.util';

@Component({
  selector: 'app-marcas',
  standalone: true,
  imports: [
    AsyncPipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    EmptyStateComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './marcas.html',
  styleUrl: './marcas.css',
})
export class MarcasComponent implements OnInit {
  private readonly marcas = inject(MarcaRepository);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly auth = inject(AuthService);
  readonly thumbnail = cloudinaryThumbnailUrl;
  readonly getMarcaImagen = marcaImagen;

  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly viewType = inject(ViewPreferenceService).getViewSignal('marcas', 'cards');
  readonly marcas$ = this.marcas.getAll().pipe(map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  readonly listViewModel$ = combineLatest([this.marcas$, this.pagination$]).pipe(
    map(([marcas, pagination]) => ({ marcas: paginateItems(marcas, pagination) })),
  );

  ngOnInit(): void {
    void this.initializeCatalogs();
  }

  openCreate(): void {
    if (!this.auth.can('catalogs.create')) return;
    this.dialog
      .open(MarcaDialogComponent, {
        width: '460px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Marca registrada correctamente.');
        }
      });
  }

  openEdit(marca: Marca): void {
    if (!this.auth.can('catalogs.update')) return;
    this.dialog
      .open(MarcaDialogComponent, {
        width: '460px',
        data: marca,
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.message('Marca actualizada correctamente.');
        }
      });
  }

  async removeMarca(id: string): Promise<void> {
    if (!this.auth.can('catalogs.delete')) return;
    await this.marcas.delete(id);
    this.message('Marca eliminada.');
  }

  updatePage(event: PageEvent): void {
    this.pagination$.next({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  private async initializeCatalogs(): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    try {
      const marcas = await firstValueFrom(this.marcas.getAll(true).pipe(take(1)));
      if (!marcas.length) {
        await Promise.all(marcasIniciales.map((nombre) => this.marcas.create({ nombre })));
      }
    } catch {
      this.message('No se pudieron inicializar las marcas.');
    }
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2500 });
  }
}

@Component({
  selector: 'app-marca-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './marca-dialog.html',
  styleUrl: './marcas.css',
})
export class MarcaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(MarcaRepository);
  private readonly dialogRef = inject(MatDialogRef<MarcaDialogComponent>);
  readonly data = inject<Marca | null>(MAT_DIALOG_DATA, { optional: true });

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
        this.errorMessage.set('Esa marca ya existe.');
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
      this.errorMessage.set('Ocurrió un error al guardar la marca.');
      this.saving.set(false);
    }
  }
}

// Alias for backwards compatibility if needed
export const MarcaEditDialogComponent = MarcaDialogComponent;
