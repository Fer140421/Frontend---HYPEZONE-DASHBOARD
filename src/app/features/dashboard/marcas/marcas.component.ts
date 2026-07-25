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
import { Marca, marcaImagen, marcasIniciales } from '../../../core/models/catalogo.model';
import { MarcaRepository } from '../../../core/repositories/marca.repository';
import { AuthService } from '../../../core/services/auth.service';
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
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSnackBarModule,
    EmptyStateComponent,
    ImageUploaderComponent,
    LoadingComponent,
    PageHeaderComponent,
  ],
  templateUrl: './marcas.html',
  styleUrl: './marcas.css',
})
export class MarcasComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
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
  readonly imagenes = signal<string[]>([]);
  readonly marcas$ = this.marcas.getAll().pipe(map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  readonly marcaForm = this.fb.nonNullable.group({ nombre: ['', Validators.required] });
  readonly listViewModel$ = combineLatest([this.marcas$, this.pagination$]).pipe(
    map(([marcas, pagination]) => ({ marcas: paginateItems(marcas, pagination) })),
  );

  ngOnInit(): void {
    void this.initializeCatalogs();
  }

  onImagesUploaded(urls: string[]): void {
    this.imagenes.set(urls);
  }

  onUploadError(msg: string): void {
    this.message(msg);
  }

  async addMarca(): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    const nombre = this.marcaForm.getRawValue().nombre.trim();
    if (!nombre) return;

    const items = await firstValueFrom(this.marcas.getAll(true).pipe(take(1)));
    if (items.some((item) => item.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase())) {
      this.message('Esa marca ya existe.');
      return;
    }

    const imagenUrl = this.imagenes()[0] || undefined;
    await this.marcas.create({ nombre, imagenUrl });
    this.marcaForm.reset();
    this.imagenes.set([]);
    this.message('Marca agregada correctamente.');
  }

  openEdit(marca: Marca): void {
    if (!this.auth.can('catalogs.update')) return;
    this.dialog.open(MarcaEditDialogComponent, {
      width: '460px',
      data: marca,
    }).afterClosed().subscribe((saved) => {
      if (saved) {
        this.message('Marca actualizada.');
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
  selector: 'app-marca-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ImageUploaderComponent,
  ],
  templateUrl: './marca-edit-dialog.html',
  styleUrl: './marcas.css',
})
export class MarcaEditDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly repository = inject(MarcaRepository);
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<MarcaEditDialogComponent>);
  readonly data = inject<Marca>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly imagenes = signal<string[]>(
    marcaImagen(this.data) ? [marcaImagen(this.data)!] : [],
  );
  readonly form = this.fb.nonNullable.group({
    nombre: [this.data?.nombre ?? '', Validators.required],
  });

  onImagesUploaded(urls: string[]): void {
    this.imagenes.set(urls);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving() || !this.auth.can('catalogs.update')) {
      return;
    }
    this.saving.set(true);
    const nombre = this.form.getRawValue().nombre.trim();
    const imagenUrl = this.imagenes()[0] || undefined;
    await this.repository.update(this.data.id!, { nombre, imagenUrl });
    this.saving.set(false);
    this.dialogRef.close(true);
  }
}
