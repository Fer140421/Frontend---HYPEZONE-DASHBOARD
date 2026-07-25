import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ProductoCleanupAudit,
  ProductoCleanupResult,
  ProductoCleanupService,
} from '../../../core/services/producto-cleanup.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-limpieza-productos',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PageHeaderComponent,
  ],
  templateUrl: './limpieza-productos.html',
  styleUrl: './limpieza-productos.css',
})
export class LimpiezaProductosComponent {
  private readonly cleanupService = inject(ProductoCleanupService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly audit = signal<ProductoCleanupAudit | null>(null);
  readonly result = signal<ProductoCleanupResult | null>(null);
  readonly working = signal(false);
  readonly error = signal('');

  canCleanup(): boolean {
    const current = this.audit();
    return current ? this.cleanupService.canCleanup(current) : false;
  }

  async runAudit(): Promise<void> {
    if (!this.auth.can('products.clean')) return;
    this.working.set(true);
    this.error.set('');
    try {
      this.audit.set(await this.cleanupService.audit());
    } catch (error) {
      this.error.set(this.messageFrom(error));
    } finally {
      this.working.set(false);
    }
  }

  confirmCleanup(): void {
    if (!this.auth.can('products.clean')) return;
    const current = this.audit();
    if (!current || !this.cleanupService.canCleanup(current) || !current.listosParaLimpieza) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Confirmar limpieza definitiva',
        message:
          'Esta acción eliminará definitivamente los campos antiguos precio e imagen de los documentos, pero no eliminará productos ni imágenes de Cloudinary.',
        confirmText: 'Limpiar productos',
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) void this.runCleanup();
    });
  }

  private async runCleanup(): Promise<void> {
    this.working.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      const result = await this.cleanupService.cleanup();
      this.result.set(result);
      this.audit.set(result.audit);
    } catch (error) {
      this.error.set(this.messageFrom(error));
    } finally {
      this.working.set(false);
    }
  }

  private messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la operación.';
  }
}
