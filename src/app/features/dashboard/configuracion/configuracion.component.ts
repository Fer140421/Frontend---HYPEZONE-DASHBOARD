import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { take } from 'rxjs';
import { FidelidadConfigRepository } from '../../../core/repositories/fidelidad-config.repository';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSnackBarModule, PageHeaderComponent],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.css',
})
export class ConfiguracionComponent {
  private readonly fb = inject(FormBuilder);
  private readonly fidelidad = inject(FidelidadConfigRepository);
  private readonly snack = inject(MatSnackBar);
  readonly form = this.fb.nonNullable.group({
    puntosPorPrenda: [10, [Validators.required, Validators.min(1)]],
    puntosParaRecompensa: [100, [Validators.required, Validators.min(1)]],
    descuentoRecompensaPorcentaje: [40, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  constructor() {
    this.fidelidad.get().pipe(take(1)).subscribe((configuracion) => this.form.patchValue(configuracion));
  }

  async guardarFidelidad(): Promise<void> {
    if (this.form.invalid) return;
    try {
      await this.fidelidad.save(this.form.getRawValue());
      this.snack.open('Configuración de fidelidad guardada.', 'OK', { duration: 2800 });
    } catch {
      this.snack.open('No se pudo guardar la configuración.', 'OK', { duration: 3200 });
    }
  }
}
