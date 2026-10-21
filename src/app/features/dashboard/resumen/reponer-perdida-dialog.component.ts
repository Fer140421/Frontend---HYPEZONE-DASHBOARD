import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FinanzasService } from '../../../core/services/finanzas.service';

@Component({
  selector: 'app-reponer-perdida-dialog',
  standalone: true,
  imports: [CurrencyPipe, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title>Registrar reposición de pérdida</h2>
    <form [formGroup]="form" (ngSubmit)="guardar()">
      <mat-dialog-content>
        <p>Las pérdidas pendientes son <strong>{{ data.perdidas | currency: 'BOB' : 'symbol-narrow' }}</strong>.</p>
        <p>El monto registrado volverá a la inversión disponible y reducirá las pérdidas pendientes.</p>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Monto repuesto (Bs)</mat-label>
          <input matInput type="number" min="0.01" [max]="data.perdidas" step="0.01" formControlName="monto" />
          <mat-error>Ingresa un monto mayor a 0 que no supere la pérdida pendiente.</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="dialogRef.close()" [disabled]="guardando()">Cancelar</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || guardando()">
          <mat-icon>check</mat-icon>{{ guardando() ? 'Guardando…' : 'Registrar reposición' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: [`.full-width{width:100%} mat-dialog-content p{line-height:1.5}`],
})
export class ReponerPerdidaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly finanzas = inject(FinanzasService);
  private readonly snackBar = inject(MatSnackBar);
  readonly dialogRef = inject(MatDialogRef<ReponerPerdidaDialogComponent>);
  readonly data = inject<{ perdidas: number }>(MAT_DIALOG_DATA);
  readonly guardando = signal(false);
  readonly form = this.fb.nonNullable.group({ monto: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(this.data.perdidas)]] });

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando()) return;
    this.guardando.set(true);
    try {
      await this.finanzas.reponerPerdida(Number(this.form.controls.monto.value));
      this.snackBar.open('Reposición registrada.', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error) {
      this.snackBar.open(error instanceof Error ? error.message : 'No se pudo registrar la reposición.', 'OK', { duration: 4000 });
    } finally {
      this.guardando.set(false);
    }
  }
}
