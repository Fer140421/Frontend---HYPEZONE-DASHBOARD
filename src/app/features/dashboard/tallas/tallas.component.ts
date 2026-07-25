import { AsyncPipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PageEvent, MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BehaviorSubject, combineLatest, firstValueFrom, map, take } from 'rxjs';
import { tallasIniciales } from '../../../core/models/catalogo.model';
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
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly tallas = inject(TallaRepository);
  private readonly snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  private readonly pagination$ = new BehaviorSubject<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  readonly pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS;
  readonly tallas$ = this.tallas.getAll().pipe(map((items) => [...items].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  readonly tallaForm = this.fb.nonNullable.group({ nombre: ['', Validators.required] });
  readonly listViewModel$ = combineLatest([this.tallas$, this.pagination$]).pipe(
    map(([tallas, pagination]) => ({ tallas: paginateItems(tallas, pagination) })),
  );

  ngOnInit(): void {
    void this.initializeCatalogs();
  }

  async addTalla(): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    await this.add(this.tallaForm.getRawValue().nombre);
    this.tallaForm.reset();
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

  private async add(value: string): Promise<void> {
    if (!this.auth.can('catalogs.create')) return;
    const nombre = value.trim();
    if (!nombre) {
      return;
    }

    const items = await firstValueFrom(this.tallas.getAll(true).pipe(take(1)));
    if (items.some((item) => item.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase())) {
      this.message('Ese registro ya existe.');
      return;
    }

    await this.tallas.create({ nombre });
    this.message('Registro agregado.');
  }

  private message(text: string): void {
    this.snack.open(text, 'OK', { duration: 2500 });
  }
}
