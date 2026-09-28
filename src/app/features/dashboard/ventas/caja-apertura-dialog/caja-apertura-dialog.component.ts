import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../../../core/services/auth.service';
import { CajaService } from '../../../../core/services/caja.service';

@Component({
  selector: 'app-caja-apertura-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './caja-apertura-dialog.html',
  styleUrl: './caja-apertura-dialog.css',
})
export class CajaAperturaDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<CajaAperturaDialogComponent>);
  private readonly cajaService = inject(CajaService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  readonly guardando = signal(false);

  readonly form = this.fb.nonNullable.group({
    montoInicial: [null as number | null, [Validators.required, Validators.min(0)]],
    notas: [''],
  });

  get cajeroNombre(): string {
    return (
      this.auth.profile()?.displayName ||
      this.auth.firebaseUser()?.displayName ||
      this.auth.firebaseUser()?.email ||
      'Usuario'
    );
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }

  async abrir(): Promise<void> {
    if (this.form.invalid || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.cajaService.abrirCaja(raw.montoInicial!, raw.notas);
      this.dialogRef.close(true);
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Error al abrir la caja.',
        'OK',
        { duration: 4000 },
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
