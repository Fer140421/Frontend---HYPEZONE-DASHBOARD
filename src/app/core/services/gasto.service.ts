import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { CategoriaGasto, FuenteDescuentoGasto, Gasto, MetodoPagoGasto } from '../models/gasto.model';
import { ESTADO_FINANCIERO_INICIAL } from '../models/finanzas.model';
import { removeUndefinedDeep } from '../repositories/firestore.repository';
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
  descontado?: boolean;
  fuenteDescuento?: FuenteDescuentoGasto;
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
  private readonly firestore = inject(Firestore);
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
      descontado: dto.descontado === true,
      fuenteDescuento: dto.descontado ? dto.fuenteDescuento : undefined,
      fecha: dto.fecha ? new Date(dto.fecha).toISOString() : new Date().toISOString(),
      cajaId,
      usuarioId: user.uid,
      usuarioNombre: profile?.displayName || user.displayName || user.email || 'Usuario',
      notas: dto.notas?.trim() || undefined,
      activo: true,
    };

    const gastoRef = doc(collection(this.firestore, 'gastos'));
    const finanzasRef = doc(this.firestore, 'finanzas/estado');
    await runTransaction(this.firestore, async (transaction) => {
      const estadoSnapshot = await transaction.get(finanzasRef);
      const estado = { ...ESTADO_FINANCIERO_INICIAL, ...(estadoSnapshot.exists() ? estadoSnapshot.data() : {}) };
      const now = serverTimestamp();
      transaction.set(gastoRef, removeUndefinedDeep({ ...nuevoGasto, activo: true, createdAt: now, updatedAt: now }));
      let inversionDisponible = Number(estado['inversionDisponible']);
      let gananciaAcumulada = Number(estado['gananciaAcumulada']);
      if (nuevoGasto.descontado) {
        if (nuevoGasto.fuenteDescuento === 'inversion') inversionDisponible -= monto;
        else gananciaAcumulada -= monto;
      }
      transaction.set(finanzasRef, { ...estado, inversionDisponible, gananciaAcumulada, updatedAt: now });
    });
    return gastoRef.id;
  }

  async actualizarGasto(id: string, cambios: Partial<Gasto>): Promise<void> {
    const gastoRef = doc(this.firestore, `gastos/${id}`);
    const finanzasRef = doc(this.firestore, 'finanzas/estado');
    await runTransaction(this.firestore, async (transaction) => {
      const [gastoSnapshot, estadoSnapshot] = await Promise.all([transaction.get(gastoRef), transaction.get(finanzasRef)]);
      if (!gastoSnapshot.exists()) throw new Error('El gasto ya no existe.');
      const current = gastoSnapshot.data() as Gasto;
      const estado = { ...ESTADO_FINANCIERO_INICIAL, ...(estadoSnapshot.exists() ? estadoSnapshot.data() : {}) };
      const now = serverTimestamp();
      const deltas: Record<string, number> = {};
      if (current.descontado) {
        const previousField = current.fuenteDescuento === 'inversion' ? 'inversionDisponible' : 'gananciaAcumulada';
        deltas[previousField] = (deltas[previousField] ?? 0) + Number(current.monto || 0);
      }
      const next = { ...current, ...cambios };
      if (next.descontado) {
        if (!next.fuenteDescuento) throw new Error('Selecciona si el gasto se descontó de inversión o de ganancia.');
        const nextField = next.fuenteDescuento === 'inversion' ? 'inversionDisponible' : 'gananciaAcumulada';
        deltas[nextField] = (deltas[nextField] ?? 0) - Number(next.monto || 0);
      }
      transaction.update(gastoRef, removeUndefinedDeep({ ...cambios, updatedAt: now }));
      transaction.set(finanzasRef, {
        ...estado,
        inversionDisponible: Number(estado['inversionDisponible']) + (deltas['inversionDisponible'] ?? 0),
        gananciaAcumulada: Number(estado['gananciaAcumulada']) + (deltas['gananciaAcumulada'] ?? 0),
        updatedAt: now,
      });
    });
  }

  async eliminarGasto(id: string): Promise<void> {
    const gastoRef = doc(this.firestore, `gastos/${id}`);
    const finanzasRef = doc(this.firestore, 'finanzas/estado');
    await runTransaction(this.firestore, async (transaction) => {
      const gastoSnapshot = await transaction.get(gastoRef);
      if (!gastoSnapshot.exists()) return;
      const gasto = gastoSnapshot.data() as Gasto;
      if (gasto.descontado) {
        const estadoSnapshot = await transaction.get(finanzasRef);
        const estado = { ...ESTADO_FINANCIERO_INICIAL, ...(estadoSnapshot.exists() ? estadoSnapshot.data() : {}) };
        const campo = gasto.fuenteDescuento === 'inversion' ? 'inversionDisponible' : 'gananciaAcumulada';
        transaction.set(finanzasRef, {
          ...estado,
          [campo]: Number(estado[campo as keyof typeof estado] ?? 0) + Number(gasto.monto || 0),
          updatedAt: serverTimestamp(),
        });
      }
      transaction.update(gastoRef, { activo: false, updatedAt: serverTimestamp() });
    });
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
