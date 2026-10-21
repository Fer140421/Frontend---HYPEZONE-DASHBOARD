import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, doc, docData, getDoc, getDocs, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import { Observable, map, shareReplay } from 'rxjs';
import { EstadoFinanciero, ESTADO_FINANCIERO_INICIAL, RegistroPerdida } from '../models/finanzas.model';
import { Caja } from '../models/caja.model';
import { Venta } from '../models/venta.model';
import { AuthService } from './auth.service';
import { removeUndefinedDeep } from '../repositories/firestore.repository';

export const ESTADO_FINANCIERO_PATH = 'finanzas/estado';

@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(AuthService);
  readonly ref = doc(this.firestore, ESTADO_FINANCIERO_PATH);

  readonly estado$: Observable<EstadoFinanciero> = (docData(this.ref) as Observable<EstadoFinanciero | undefined>).pipe(
    map((estado) => ({ ...ESTADO_FINANCIERO_INICIAL, ...(estado ?? {}) })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly perdidasManuales$: Observable<RegistroPerdida[]> = (
    collectionData(collection(this.firestore, 'perdidas'), { idField: 'id' }) as Observable<RegistroPerdida[]>
  ).pipe(
    map((perdidas) => perdidas.filter((perdida) => perdida.activo !== false)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async ensureInitialized(): Promise<void> {
    const currentSnapshot = await getDoc(this.ref);
    const currentState = currentSnapshot.exists() ? currentSnapshot.data() as Partial<EstadoFinanciero> : undefined;
    if (currentState?.historialPerdidasImportado === true) return;
    const fechaInicio = currentState?.fechaInicioControl || new Date().toISOString();
    const inicioMs = new Date(fechaInicio).getTime();
    const [cajasSnapshot, ventasSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'cajas')),
      getDocs(collection(this.firestore, 'ventas')),
    ]);
    const cajasCerradasAntesDelControl = new Set(cajasSnapshot.docs
      .filter((snapshot) => {
        const caja = snapshot.data() as Caja;
        return caja.estado === 'cerrada' && new Date(caja.fechaCierre || 0).getTime() < inicioMs;
      })
      .map((snapshot) => snapshot.id));
    const perdidasHistoricas = ventasSnapshot.docs.reduce((total, snapshot) => {
      const venta = snapshot.data() as Venta;
      const anteriorAlControl = venta.cajaId
        ? cajasCerradasAntesDelControl.has(venta.cajaId)
        : new Date(venta.fechaVenta || 0).getTime() < inicioMs;
      if (venta.activo === false || !anteriorAlControl) return total;
      const margen = Number(venta.ganancia ?? (Number(venta.precioVenta || 0) - Number(venta.precioCompra || 0)));
      return total + Math.max(0, -margen);
    }, 0);
    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(this.ref);
      const estadoActual = {
        ...ESTADO_FINANCIERO_INICIAL,
        ...(snapshot.exists() ? snapshot.data() : {}),
      } as EstadoFinanciero;
      if (estadoActual.historialPerdidasImportado === true) return;
      // If a balance is already present, it may include losses recorded by caja
      // closures. Importing closed sales on top would count those losses twice.
      const yaTieneSaldoDePerdidas = Number(estadoActual.perdidasAcumuladas) > 0;
      transaction.set(this.ref, {
        ...estadoActual,
        fechaInicioControl: fechaInicio,
        perdidasAcumuladas: yaTieneSaldoDePerdidas
          ? Number(estadoActual.perdidasAcumuladas)
          : Number(perdidasHistoricas.toFixed(2)),
        historialPerdidasImportado: true,
        updatedAt: serverTimestamp(),
      });
    });
  }

  async registrarPerdidaHistorica(concepto: string, monto: number, notas?: string): Promise<void> {
    const valor = Number(monto);
    if (!concepto.trim()) throw new Error('Describe la prenda o la pérdida.');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('El monto debe ser mayor a 0.');
    const user = this.auth.firebaseUser();
    const profile = this.auth.profile();
    const perdidaRef = doc(collection(this.firestore, 'perdidas'));
    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(this.ref);
      const estado = { ...ESTADO_FINANCIERO_INICIAL, ...(snapshot.exists() ? snapshot.data() : {}) };
      const timestamp = serverTimestamp();
      transaction.set(perdidaRef, removeUndefinedDeep({
        concepto: concepto.trim(),
        monto: Number(valor.toFixed(2)),
        fecha: new Date().toISOString(),
        tipo: 'historica_manual',
        notas: notas?.trim() || undefined,
        usuarioId: user?.uid,
        usuarioNombre: profile?.displayName || user?.displayName || user?.email || 'Usuario',
        activo: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      transaction.set(this.ref, {
        ...estado,
        perdidasAcumuladas: Number((Number(estado.perdidasAcumuladas) + valor).toFixed(2)),
        updatedAt: timestamp,
      });
    });
  }

  async reponerPerdida(monto: number): Promise<void> {
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Ingresa un monto mayor a 0.');
    await runTransaction(this.firestore, async (transaction) => {
      const snapshot = await transaction.get(this.ref);
      const estado = {
        ...ESTADO_FINANCIERO_INICIAL,
        ...(snapshot.exists() ? (snapshot.data() as Partial<EstadoFinanciero>) : {}),
      };
      const perdidasPendientes = Number(estado.perdidasAcumuladas);
      if (valor > perdidasPendientes) throw new Error('El monto supera las pérdidas pendientes de reposición.');
      transaction.set(this.ref, {
        ...estado,
        inversionDisponible: Number(estado.inversionDisponible) + valor,
        perdidasAcumuladas: Number((perdidasPendientes - valor).toFixed(2)),
        updatedAt: serverTimestamp(),
      });
    });
  }

  read(snapshot: { exists(): boolean; data(): unknown }): EstadoFinanciero {
    return {
      ...ESTADO_FINANCIERO_INICIAL,
      ...(snapshot.exists() ? (snapshot.data() as Partial<EstadoFinanciero>) : {}),
    };
  }
}
