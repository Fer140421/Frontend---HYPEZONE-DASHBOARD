import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FinanzasService } from '../../../core/services/finanzas.service';

@Component({
  selector: 'app-registrar-perdida-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title>Registrar pérdida anterior</h2>
    <form [formGroup]="form" (ngSubmit)="guardar()">
      <mat-dialog-content>
        <p>Registra aquí una prenda dañada o una pérdida anterior que no aparezca en las ventas. El monto se sumará a las pérdidas pendientes y no se descontará de la inversión ni de la ganancia.</p>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Prenda o descripción</mat-label>
          <input matInput formControlName="concepto" maxlength="120" placeholder="Ej.: polera dañada al llegar" />
          <mat-error>Describe la prenda o la pérdida.</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Monto de la pérdida (Bs)</mat-label>
          <input matInput type="number" min="0.01" step="0.01" formControlName="monto" />
          <mat-error>Ingresa un monto mayor a 0.</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notas (opcional)</mat-label>
          <textarea matInput rows="2" formControlName="notas"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="dialogRef.close()" [disabled]="guardando()">Cancelar</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || guardando()">
          <mat-icon>add</mat-icon>{{ guardando() ? 'Guardando…' : 'Registrar pérdida' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`.full-width{width:100%} mat-dialog-content p{line-height:1.5}`],
})
export class RegistrarPerdidaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly finanzas = inject(FinanzasService);
  private readonly snackBar = inject(MatSnackBar);
  readonly dialogRef = inject(MatDialogRef<RegistrarPerdidaDialogComponent>);
  readonly guardando = signal(false);
  readonly form = this.fb.nonNullable.group({
    concepto: ['', [Validators.required, Validators.maxLength(120)]],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    notas: [''],
  });

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando()) return;
    this.guardando.set(true);
    try {
      const value = this.form.getRawValue();
      await this.finanzas.registrarPerdidaHistorica(value.concepto, Number(value.monto), value.notas);
      this.snackBar.open('Pérdida registrada.', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error) {
      this.snackBar.open(error instanceof Error ? error.message : 'No se pudo registrar la pérdida.', 'OK', { duration: 4000 });
    } finally {
      this.guardando.set(false);
    }
  }
}
