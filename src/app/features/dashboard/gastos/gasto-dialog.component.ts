import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CATEGORIAS_GASTO, CategoriaGasto, Gasto, MetodoPagoGasto } from '../../../core/models/gasto.model';
import { CajaService } from '../../../core/services/caja.service';
import { GastoService } from '../../../core/services/gasto.service';

export interface GastoDialogData {
  gasto?: Gasto;
}

@Component({
  selector: 'app-gasto-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './gasto-dialog.html',
  styleUrl: './gasto-dialog.css',
})
export class GastoDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<GastoDialogComponent>);
  private readonly gastoService = inject(GastoService);
  private readonly cajaService = inject(CajaService);
  private readonly snackBar = inject(MatSnackBar);
  readonly data = inject<GastoDialogData>(MAT_DIALOG_DATA, { optional: true });

  readonly guardando = signal(false);
  readonly categorias = CATEGORIAS_GASTO;
  readonly cajaActiva = this.cajaService.miCajaAbierta;

  readonly form = this.fb.nonNullable.group({
    concepto: ['', [Validators.required, Validators.maxLength(120)]],
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    categoria: ['otro' as CategoriaGasto, [Validators.required]],
    metodoPago: ['caja_efectivo' as MetodoPagoGasto, [Validators.required]],
    fecha: [new Date().toISOString().substring(0, 10), [Validators.required]],
    pagarDeCajaActiva: [true],
    notas: [''],
  });

  ngOnInit(): void {
    if (this.data?.gasto) {
      const g = this.data.gasto;
      this.form.patchValue({
        concepto: g.concepto,
        monto: g.monto,
        categoria: g.categoria,
        metodoPago: g.metodoPago,
        fecha: g.fecha ? g.fecha.substring(0, 10) : new Date().toISOString().substring(0, 10),
        pagarDeCajaActiva: g.metodoPago === 'caja_efectivo' && !!g.cajaId,
        notas: g.notas || '',
      });
    } else {
      // Si no hay caja abierta, por defecto usar cuenta_banco y pagarDeCajaActiva = false
      if (!this.cajaActiva()) {
        this.form.patchValue({
          metodoPago: 'cuenta_banco',
          pagarDeCajaActiva: false,
        });
      }
    }

    this.form.controls.pagarDeCajaActiva.valueChanges.subscribe((afecta) => {
      if (afecta) {
        this.form.controls.metodoPago.setValue('caja_efectivo');
      } else if (this.form.controls.metodoPago.value === 'caja_efectivo') {
        this.form.controls.metodoPago.setValue('cuenta_banco');
      }
    });

    this.form.controls.metodoPago.valueChanges.subscribe((metodo) => {
      if (metodo === 'caja_efectivo' && this.cajaActiva()) {
        this.form.controls.pagarDeCajaActiva.setValue(true, { emitEvent: false });
      } else {
        this.form.controls.pagarDeCajaActiva.setValue(false, { emitEvent: false });
      }
    });
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    try {
      const val = this.form.getRawValue();

      if (this.data?.gasto?.id) {
        await this.gastoService.actualizarGasto(this.data.gasto.id, {
          concepto: val.concepto.trim(),
          monto: Number(val.monto),
          categoria: val.categoria,
          metodoPago: val.metodoPago,
          fecha: new Date(val.fecha).toISOString(),
          notas: val.notas.trim() || undefined,
        });
        this.snackBar.open('Gasto actualizado con éxito.', 'OK', { duration: 3000 });
      } else {
        await this.gastoService.registrarGasto({
          concepto: val.concepto,
          monto: Number(val.monto),
          categoria: val.categoria,
          metodoPago: val.metodoPago,
          fecha: val.fecha,
          notas: val.notas,
          afectarCajaActiva: val.pagarDeCajaActiva,
        });
        this.snackBar.open('Gasto registrado con éxito.', 'OK', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Error al registrar el gasto.',
        'OK',
        { duration: 4000 },
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
