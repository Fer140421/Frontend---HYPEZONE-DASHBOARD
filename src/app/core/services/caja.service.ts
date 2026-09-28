import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';
import { Observable, firstValueFrom, of, shareReplay, switchMap, take } from 'rxjs';
import { Caja, CierreCajaCalculo } from '../models/caja.model';
import { Venta } from '../models/venta.model';
import { CajaRepository } from '../repositories/caja.repository';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly firestore = inject(Firestore);
  private readonly cajaRepository = inject(CajaRepository);
  private readonly auth = inject(AuthService);

  readonly miCajaAbierta$: Observable<Caja | null> = this.auth.sessionState$.pipe(
    switchMap((state) => {
      const uid = state.user?.uid;
      if (!uid) {
        return of(null);
      }
      return this.cajaRepository.getCajaAbiertaPorUsuario(uid);
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly miCajaAbierta = toSignal(this.miCajaAbierta$, { initialValue: null });

  readonly todasLasCajas$: Observable<Caja[]> = this.cajaRepository.getAll(true).pipe(
    switchMap((cajas) =>
      of(
        [...cajas].sort(
          (a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime(),
        ),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async abrirCaja(montoInicial: number, notasApertura?: string): Promise<string> {
    const user = this.auth.firebaseUser();
    const profile = this.auth.profile();
    if (!user?.uid) {
      throw new Error('No hay una sesión de usuario activa.');
    }

    const actual = await firstValueFrom(
      this.cajaRepository.getCajaAbiertaPorUsuario(user.uid).pipe(take(1)),
    );
    if (actual) {
      throw new Error('Ya tienes una caja abierta actualmente. Debes cerrarla antes de abrir una nueva.');
    }

    const monto = Number(montoInicial);
    if (!Number.isFinite(monto) || monto < 0) {
      throw new Error('El monto inicial debe ser un número mayor o igual a 0.');
    }

    const nuevaCaja: Partial<Caja> = {
      usuarioId: user.uid,
      usuarioNombre: profile?.displayName || user.displayName || user.email || 'Usuario',
      usuarioEmail: user.email || undefined,
      montoInicial: monto,
      fechaApertura: new Date().toISOString(),
      estado: 'abierta',
      notasApertura: notasApertura?.trim() || undefined,
      activo: true,
    };

    return this.cajaRepository.create(nuevaCaja);
  }

  async calcularResumenCaja(cajaId: string, montoInicial: number): Promise<CierreCajaCalculo> {
    const ref = collection(this.firestore, 'ventas');
    const q = query(ref, where('cajaId', '==', cajaId));
    const snap = await getDocs(q);

    const ventas = snap.docs
      .map((d) => d.data() as Venta)
      .filter((v) => v.activo !== false);

    const totalVentasEfectivo = ventas
      .filter((v) => v.metodoPago === 'efectivo')
      .reduce((sum, v) => sum + Number(v.precioVenta || 0), 0);

    const totalVentasQR = ventas
      .filter((v) => v.metodoPago === 'qr')
      .reduce((sum, v) => sum + Number(v.precioVenta || 0), 0);

    const totalVentas = totalVentasEfectivo + totalVentasQR;
    const totalEsperadoEfectivo = Number(montoInicial || 0) + totalVentasEfectivo;

    return {
      montoInicial: Number(montoInicial || 0),
      totalVentasEfectivo,
      totalVentasQR,
      totalVentas,
      totalEsperadoEfectivo,
      cantidadVentas: ventas.length,
    };
  }

  async cerrarCaja(cajaId: string, montoFinalReal: number, notasCierre?: string): Promise<void> {
    const cajaSnap = await firstValueFrom(this.cajaRepository.getById(cajaId).pipe(take(1)));
    if (!cajaSnap) {
      throw new Error('Caja no encontrada.');
    }
    if (cajaSnap.estado !== 'abierta') {
      throw new Error('La caja ya se encuentra cerrada.');
    }

    const user = this.auth.firebaseUser();
    const profile = this.auth.profile();

    const montoReal = Number(montoFinalReal);
    if (!Number.isFinite(montoReal) || montoReal < 0) {
      throw new Error('El monto final en efectivo debe ser un número válido.');
    }

    const resumen = await this.calcularResumenCaja(cajaId, cajaSnap.montoInicial);
    const diferencia = montoReal - resumen.totalEsperadoEfectivo;

    await this.cajaRepository.update(cajaId, {
      estado: 'cerrada',
      fechaCierre: new Date().toISOString(),
      montoFinalReal: montoReal,
      totalVentasEfectivo: resumen.totalVentasEfectivo,
      totalVentasQR: resumen.totalVentasQR,
      totalVentas: resumen.totalVentas,
      totalEsperadoEfectivo: resumen.totalEsperadoEfectivo,
      diferencia,
      usuarioCierreId: user?.uid,
      usuarioCierreNombre: profile?.displayName || user?.displayName || user?.email || 'Usuario',
      notasCierre: notasCierre?.trim() || undefined,
    });
  }

  async getVentasPorCaja(cajaId: string): Promise<Venta[]> {
    const ref = collection(this.firestore, 'ventas');
    const q = query(ref, where('cajaId', '==', cajaId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Venta)
      .filter((v) => v.activo !== false);
  }
}
