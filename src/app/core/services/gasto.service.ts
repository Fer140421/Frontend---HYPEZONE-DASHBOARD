import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { CategoriaGasto, Gasto, MetodoPagoGasto } from '../models/gasto.model';
import { GastoRepository } from '../repositories/gasto.repository';
import { AuthService } from './auth.service';
import { CajaService } from './caja.service';

export interface CrearGastoDto {
  concepto: string;
  monto: number;
  categoria: CategoriaGasto;
  metodoPago: MetodoPagoGasto;
  fecha?: string;
  notas?: string;
  afectarCajaActiva?: boolean;
}

export interface ResumenGastos {
  total: number;
  totalCaja: number;
  totalBanco: number;
  porCategoria: { categoria: CategoriaGasto; monto: number }[];
}

@Injectable({ providedIn: 'root' })
export class GastoService {
  private readonly gastoRepository = inject(GastoRepository);
  private readonly auth = inject(AuthService);
  private readonly cajaService = inject(CajaService);

  readonly gastos$: Observable<Gasto[]> = this.gastoRepository.getAll(true).pipe(
    map((gastos) =>
      [...gastos].sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async registrarGasto(dto: CrearGastoDto): Promise<string> {
    const user = this.auth.firebaseUser();
    const profile = this.auth.profile();

    if (!user?.uid) {
      throw new Error('No hay una sesión activa.');
    }

    const monto = Number(dto.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('El monto del gasto debe ser mayor a 0.');
    }

    if (!dto.concepto || !dto.concepto.trim()) {
      throw new Error('El concepto del gasto es requerido.');
    }

    let cajaId: string | undefined;
    if (dto.afectarCajaActiva || dto.metodoPago === 'caja_efectivo') {
      const cajaAbierta = this.cajaService.miCajaAbierta();
      if (cajaAbierta?.id) {
        cajaId = cajaAbierta.id;
      }
    }

    const nuevoGasto: Partial<Gasto> = {
      concepto: dto.concepto.trim(),
      monto,
      categoria: dto.categoria,
      metodoPago: dto.metodoPago,
      fecha: dto.fecha ? new Date(dto.fecha).toISOString() : new Date().toISOString(),
      cajaId,
      usuarioId: user.uid,
      usuarioNombre: profile?.displayName || user.displayName || user.email || 'Usuario',
      notas: dto.notas?.trim() || undefined,
      activo: true,
    };

    return this.gastoRepository.create(nuevoGasto);
  }

  async actualizarGasto(id: string, cambios: Partial<Gasto>): Promise<void> {
    return this.gastoRepository.update(id, cambios);
  }

  async eliminarGasto(id: string): Promise<void> {
    return this.gastoRepository.delete(id);
  }

  calcularResumen(gastos: Gasto[]): ResumenGastos {
    const activos = gastos.filter((g) => g.activo !== false);

    let total = 0;
    let totalCaja = 0;
    let totalBanco = 0;
    const catMap = new Map<CategoriaGasto, number>();

    for (const g of activos) {
      const monto = Number(g.monto || 0);
      total += monto;

      if (g.metodoPago === 'caja_efectivo') {
        totalCaja += monto;
      } else {
        totalBanco += monto;
      }

      catMap.set(g.categoria, (catMap.get(g.categoria) || 0) + monto);
    }

    const porCategoria = Array.from(catMap.entries()).map(([categoria, monto]) => ({
      categoria,
      monto,
    }));

    return {
      total,
      totalCaja,
      totalBanco,
      porCategoria,
    };
  }
}
