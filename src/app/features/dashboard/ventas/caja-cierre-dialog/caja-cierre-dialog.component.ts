import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Caja, CierreCajaCalculo } from '../../../../core/models/caja.model';
import { CajaService } from '../../../../core/services/caja.service';

export interface CajaCierreDialogData {
  caja: Caja;
}

@Component({
  selector: 'app-caja-cierre-dialog',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './caja-cierre-dialog.html',
  styleUrl: './caja-cierre-dialog.css',
})
export class CajaCierreDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<CajaCierreDialogComponent>);
  private readonly cajaService = inject(CajaService);
  private readonly snackBar = inject(MatSnackBar);
  readonly data = inject<CajaCierreDialogData>(MAT_DIALOG_DATA);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly resumen = signal<CierreCajaCalculo | null>(null);

  readonly form = this.fb.nonNullable.group({
    montoFinalReal: [null as number | null, [Validators.required, Validators.min(0)]],
    notas: [''],
  });

  readonly montoIngresado = signal<number | null>(null);

  readonly diferencia = computed(() => {
    const r = this.resumen();
    if (!r) return null;
    const ingresado = this.montoIngresado();
    if (ingresado === null || !Number.isFinite(ingresado)) {
      return null;
    }
    // Si la venta fue por QR principalmente, la referencia natural es el capital acumulado
    const referencia = r.totalVentasEfectivo > 0 ? r.totalEsperadoEfectivo : r.capitalMasInversion;
    return ingresado - referencia;
  });

  readonly gananciaRetirada = computed(() => {
    const r = this.resumen();
    const ingresado = this.montoIngresado();
    if (!r || ingresado === null || !Number.isFinite(ingresado)) return null;
    return r.totalEsperadoGeneral - ingresado;
  });

  ngOnInit(): void {
    this.form.controls.montoFinalReal.valueChanges.subscribe((val) => {
      this.montoIngresado.set(val !== null && val !== undefined ? Number(val) : null);
    });

    void this.cargarResumen();
  }

  establecerMonto(valor: number): void {
    this.form.controls.montoFinalReal.setValue(Number(valor.toFixed(2)));
  }

  async cargarResumen(): Promise<void> {
    if (!this.data.caja.id) return;
    this.cargando.set(true);
    try {
      const calculo = await this.cajaService.calcularResumenCaja(
        this.data.caja.id,
        this.data.caja.montoInicial,
      );
      this.resumen.set(calculo);
      if (this.form.controls.montoFinalReal.value === null) {
        // Pre-cargar por defecto con Capital inicial + Costo de prendas vendidas (inversión recuperada)
        this.establecerMonto(calculo.capitalMasInversion);
      }
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Error al calcular resumen de caja.',
        'OK',
        { duration: 4000 },
      );
    } finally {
      this.cargando.set(false);
    }
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }

  async cerrarCaja(): Promise<void> {
    if (this.form.invalid || this.guardando() || !this.data.caja.id) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.cajaService.cerrarCaja(
        this.data.caja.id,
        raw.montoFinalReal!,
        raw.notas,
      );
      this.dialogRef.close(true);
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : 'Error al cerrar la caja.',
        'OK',
        { duration: 4000 },
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
