import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConsignacionService, SaldoConsignador } from '../../../core/services/consignacion.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-consignaciones', standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSnackBarModule, PageHeaderComponent],
  template: `
    <app-page-header title="Consignaciones" description="Saldos por pagar y utilidad de prendas recibidas en consignación." />
    <div class="summary"><mat-card><small>Pendiente total a consignadores</small><strong>{{ totalPendiente() | currency:'BOB':'symbol-narrow' }}</strong></mat-card></div>
    @if (saldos().length === 0) {
      <mat-card class="empty"><mat-icon>check_circle</mat-icon><h2>Todo al día</h2><p>No hay saldos pendientes con consignadores.</p></mat-card>
    } @else {
      <div class="cards">
        @for (saldo of saldos(); track saldo.nombre) {
          <mat-card class="owner-card">
            <div class="owner-head"><div><small>Consignador</small><h2>{{ saldo.nombre }}</h2></div><strong class="amount">{{ saldo.pendiente | currency:'BOB':'symbol-narrow' }}</strong></div>
            <div class="sale-list">
              @for (venta of saldo.ventas; track venta.id) {
                <div class="sale"><span>{{ venta.nombreProducto }} · {{ venta.fechaVenta | date:'dd/MM/yyyy' }}</span><span>Debe {{ (Number(venta.montoPendienteConsignador ?? venta.precioCompra) - Number(venta.montoLiquidadoConsignador ?? 0)) | currency:'BOB':'symbol-narrow' }}</span><span>Tu comisión {{ venta.ganancia | currency:'BOB':'symbol-narrow' }}</span></div>
              }
            </div>
            <form [formGroup]="forms[saldo.nombre]" (ngSubmit)="liquidar(saldo)">
              <mat-form-field appearance="outline"><mat-label>Monto a pagar</mat-label><input matInput type="number" min="0.01" step="0.01" formControlName="monto" /><mat-hint>Saldo: {{ saldo.pendiente | currency:'BOB':'symbol-narrow' }}</mat-hint></mat-form-field>
              <button mat-flat-button type="submit" [disabled]="forms[saldo.nombre].invalid || guardando()"><mat-icon>payments</mat-icon> Registrar pago</button>
            </form>
          </mat-card>
        }
      </div>
    }
  `,
  styles: [`
    :host{display:block}.summary{margin:0 0 18px}.summary mat-card{display:flex;gap:8px;flex-direction:column;padding:18px 22px;max-width:360px}.summary small,.owner-head small{color:#6b7280}.summary strong{font-size:1.55rem;color:#9a3412}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}.owner-card{padding:20px}.owner-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.owner-head h2{margin:4px 0;font-size:1.15rem}.amount{font-size:1.3rem;color:#9a3412}.sale-list{margin:14px 0;border-top:1px solid #e5e7eb}.sale{display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f1f3;font-size:.86rem}.sale span:last-child{color:#047857}.owner-card form{display:flex;align-items:center;gap:12px;margin-top:12px}.owner-card form mat-form-field{flex:1}.empty{text-align:center;padding:36px;color:#6b7280}.empty mat-icon{color:#059669;font-size:40px;width:40px;height:40px}@media(max-width:600px){.owner-card form{align-items:stretch;flex-direction:column}.cards{grid-template-columns:1fr}}
  `],
})
export class ConsignacionesComponent {
  private readonly service = inject(ConsignacionService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  readonly saldos = signal<SaldoConsignador[]>([]);
  readonly forms: Record<string, FormGroup> = {};
  readonly guardando = signal(false);
  readonly totalPendiente = () => this.saldos().reduce((sum, saldo) => sum + saldo.pendiente, 0);

  constructor() { void this.cargar(); }
  private async cargar(): Promise<void> {
    try {
      const items = await this.service.getSaldos();
      for (const item of items) this.forms[item.nombre] ??= this.fb.nonNullable.group({ monto: [item.pendiente, [Validators.required, Validators.min(0.01), Validators.max(item.pendiente)]] });
      this.saldos.set(items);
    } catch { this.snackBar.open('No se pudieron cargar los saldos de consignación.', 'Cerrar', { duration: 3500 }); }
  }
  async liquidar(saldo: SaldoConsignador): Promise<void> {
    const monto = Number(this.forms[saldo.nombre].getRawValue().monto);
    this.guardando.set(true);
    try { await this.service.liquidar(saldo.nombre, monto); this.snackBar.open('Pago al consignador registrado.', 'Cerrar', { duration: 3000 }); await this.cargar(); }
    catch (error) { this.snackBar.open(error instanceof Error ? error.message : 'No se pudo registrar el pago.', 'Cerrar', { duration: 4000 }); }
    finally { this.guardando.set(false); }
  }
  Number(value: unknown): number { return Number(value ?? 0); }
}
