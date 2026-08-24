import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface QuickCatalogValueDialogData {
  label: string;
}

@Component({
  selector: 'app-quick-catalog-value-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Registrar {{ data.label }}</h2>
    <mat-dialog-content>
      <p class="muted">Esta opción se agregará al catálogo al guardar el producto.</p>
      <form [formGroup]="form" (ngSubmit)="confirmar()">
        <mat-form-field appearance="outline"><mat-label>{{ data.label }}</mat-label><input matInput formControlName="nombre" autocomplete="off" /></mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button type="button" (click)="ref.close()">Cancelar</button><button mat-flat-button class="primary-action" type="button" [disabled]="form.invalid" (click)="confirmar()">Agregar</button></mat-dialog-actions>
  `,
  styles: [`mat-form-field{width:100%}.muted{margin-top:0}`],
})
export class QuickCatalogValueDialogComponent {
  readonly data = inject<QuickCatalogValueDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<QuickCatalogValueDialogComponent>);
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({ nombre: ['', [Validators.required, Validators.maxLength(80)]] });

  confirmar(): void {
    const nombre = this.form.controls.nombre.getRawValue().trim();
    if (nombre) this.ref.close(nombre);
  }
}
