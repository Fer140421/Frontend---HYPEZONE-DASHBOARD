import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { loteFechaCompra } from '../../../core/models/lote.model';
import {
  Producto,
  imagenesProducto,
  precioCompraProducto,
  precioProducto,
} from '../../../core/models/producto.model';
import { StatusChipComponent } from '../../../shared/components/status-chip/status-chip.component';
import { LoteDetail } from './lotes.component';

export interface LoteDetailDialogData {
  detail: LoteDetail;
  canUpdate: boolean;
}

@Component({
  selector: 'app-lote-detail-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    StatusChipComponent,
  ],
  templateUrl: './lote-detail-dialog.html',
  styleUrl: './lote-detail-dialog.css',
})
export class LoteDetailDialogComponent {
  readonly Math = Math;
  private readonly dialogRef = inject(MatDialogRef<LoteDetailDialogComponent>);
  readonly data = inject<LoteDetailDialogData>(MAT_DIALOG_DATA);

  get detail(): LoteDetail {
    return this.data.detail;
  }

  get canUpdate(): boolean {
    return this.data.canUpdate;
  }

  fecha(value: unknown): Date {
    return loteFechaCompra(value as any);
  }

  precio(producto: Producto): number {
    return precioProducto(producto);
  }

  precioCompra(producto: Producto): number {
    return precioCompraProducto(producto);
  }

  foto(producto: Producto): string | null {
    const imgs = imagenesProducto(producto);
    return imgs.length > 0 ? imgs[0] : null;
  }

  onEdit(): void {
    this.dialogRef.close({ action: 'edit', id: this.detail.resumen.lote.id });
  }
}
