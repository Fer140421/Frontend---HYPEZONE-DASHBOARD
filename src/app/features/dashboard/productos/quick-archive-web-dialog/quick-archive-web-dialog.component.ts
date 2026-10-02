import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Producto, precioProducto } from '../../../../core/models/producto.model';
import { StatusChipComponent } from '../../../../shared/components/status-chip/status-chip.component';
import { cloudinaryThumbnailUrl } from '../../../../core/utils/cloudinary-image.util';

export interface QuickArchiveWebDialogData {
  productos: Producto[];
}

@Component({
  selector: 'app-quick-archive-web-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    StatusChipComponent,
  ],
  templateUrl: './quick-archive-web-dialog.component.html',
  styleUrl: './quick-archive-web-dialog.component.css',
})
export class QuickArchiveWebDialogComponent {
  readonly data = inject<QuickArchiveWebDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<QuickArchiveWebDialogComponent>);

  readonly search = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly soloDisponibles = signal(true);
  readonly guardando = signal(false);

  readonly filtered = computed(() => {
    const query = this.search().toLowerCase().trim();
    const soloDisp = this.soloDisponibles();

    return this.data.productos.filter((p) => {
      if (p.activo === false) return false;
      if (soloDisp && p.estado === 'vendido') return false;

      if (!query) return true;
      const haystack = [p.nombre, p.marca, p.codigo, p.talla, p.categoria]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  readonly allSelected = computed(() => {
    const items = this.filtered();
    const set = this.selected();
    return items.length > 0 && items.every((p) => p.id && set.has(p.id));
  });

  precio(p: Producto): number {
    return precioProducto(p);
  }

  thumb(p: Producto): string {
    return cloudinaryThumbnailUrl(p.imagenes?.[0] ?? '');
  }

  toggle(p: Producto, checked: boolean): void {
    if (!p.id) return;
    this.selected.update((curr) => {
      const next = new Set(curr);
      if (checked) {
        next.add(p.id!);
      } else {
        next.delete(p.id!);
      }
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    const items = this.filtered();
    this.selected.update((curr) => {
      const next = new Set(curr);
      items.forEach((p) => {
        if (!p.id) return;
        if (checked) {
          next.add(p.id);
        } else {
          next.delete(p.id);
        }
      });
      return next;
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirmar(): void {
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.dialogRef.close(ids);
  }
}
