import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { DestinoDevolucionProducto, Producto, precioCompraProducto } from '../../../core/models/producto.model';

@Component({
  selector: 'app-product-delete-dialog',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatButtonModule, MatDialogModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Eliminar producto</h2>
    <mat-dialog-content>
      <p>Se ocultará «{{ producto.nombre }}» del inventario y de la web.</p>
      @if (producto.finanzasRegistrado) {
        <p>El costo de compra, <strong>{{ costo | currency:'BOB':'symbol-narrow' }}</strong>, se devolverá a:</p>
        <mat-radio-group [(ngModel)]="destino" aria-label="Destino de la devolución">
          <mat-radio-button value="inversion">Inversión disponible</mat-radio-button>
          <mat-radio-button value="ganancia">Ganancia acumulada</mat-radio-button>
        </mat-radio-group>
      } @else {
        <p>Este producto no tiene un descuento de compra registrado en finanzas; eliminarlo no modificará los saldos.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button mat-flat-button type="button" (click)="ref.close(destino)">Eliminar producto</button>
    </mat-dialog-actions>
  `,
  styles: [`mat-radio-group { display: flex; flex-direction: column; gap: 8px; }`],
})
export class ProductDeleteDialogComponent {
  readonly producto = inject<Producto>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ProductDeleteDialogComponent>);
  readonly costo = precioCompraProducto(this.producto);
  destino: DestinoDevolucionProducto = 'inversion';
}
