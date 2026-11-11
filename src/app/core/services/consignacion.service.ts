import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from '@angular/fire/firestore';
import { Venta } from '../models/venta.model';
import { ESTADO_FINANCIERO_INICIAL } from '../models/finanzas.model';

export interface SaldoConsignador {
  nombre: string;
  pendiente: number;
  ventas: Venta[];
}

@Injectable({ providedIn: 'root' })
export class ConsignacionService {
  private readonly firestore = inject(Firestore);

  async getSaldos(): Promise<SaldoConsignador[]> {
    const snapshot = await getDocs(query(collection(this.firestore, 'ventas'), where('consignado', '==', true)));
    const ventas = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Venta) }));
    const agrupados = new Map<string, SaldoConsignador>();
    for (const venta of ventas) {
      if (venta.activo === false) continue;
      const nombre = venta.consignadorNombre?.trim() || 'Dueño sin nombre';
      const saldo = agrupados.get(nombre) ?? { nombre, pendiente: 0, ventas: [] };
      const adeudado = Number(venta.montoPendienteConsignador ?? venta.precioCompra ?? 0);
      const pagado = Number(venta.montoLiquidadoConsignador ?? 0);
      saldo.pendiente += Math.max(0, adeudado - pagado);
      if (adeudado > pagado) saldo.ventas.push(venta);
      agrupados.set(nombre, saldo);
    }
    return [...agrupados.values()].filter((item) => item.pendiente > 0.009).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  async liquidar(nombre: string, monto: number): Promise<void> {
    const valor = Number(monto);
    if (!nombre.trim() || !Number.isFinite(valor) || valor <= 0) throw new Error('Ingresa un monto de liquidación válido.');
    const snapshot = await getDocs(query(collection(this.firestore, 'ventas'), where('consignado', '==', true), where('consignadorNombre', '==', nombre)));
    const pendientes = snapshot.docs.map((item) => ({ ref: item.ref, venta: item.data() as Venta }))
      .filter(({ venta }) => venta.activo !== false && Number(venta.montoPendienteConsignador ?? venta.precioCompra ?? 0) > Number(venta.montoLiquidadoConsignador ?? 0))
      .sort((a, b) => a.venta.fechaVenta.localeCompare(b.venta.fechaVenta));
    const disponible = pendientes.reduce((sum, item) => sum + Number(item.venta.montoPendienteConsignador ?? item.venta.precioCompra ?? 0) - Number(item.venta.montoLiquidadoConsignador ?? 0), 0);
    if (valor > disponible + 0.009) throw new Error('El monto supera el saldo pendiente de este dueño.');

    const finanzasRef = doc(this.firestore, 'finanzas/estado');
    const pagoRef = doc(collection(this.firestore, 'liquidacionesConsignacion'));
    await runTransaction(this.firestore, async (transaction) => {
      const finanzasSnapshot = await transaction.get(finanzasRef);
      const ventaSnapshots = await Promise.all(pendientes.map(({ ref }) => transaction.get(ref)));
      const cajaIds = [...new Set(ventaSnapshots.map((item) => item.data()?.['cajaId']).filter((id): id is string => typeof id === 'string'))];
      const cajaSnapshots = await Promise.all(cajaIds.map((id) => transaction.get(doc(this.firestore, `cajas/${id}`))));
      const cajasCerradas = new Set(cajaSnapshots.filter((item) => item.data()?.['estado'] === 'cerrada').map((item) => item.id));
      let restante = valor;
      let deudaFinancieraReducida = 0;
      const timestamp = serverTimestamp();
      ventaSnapshots.forEach((item) => {
        if (restante <= 0.009 || !item.exists()) return;
        const venta = item.data() as Venta;
        const adeudado = Number(venta.montoPendienteConsignador ?? venta.precioCompra ?? 0);
        const pagado = Number(venta.montoLiquidadoConsignador ?? 0);
        const abono = Math.min(restante, Math.max(0, adeudado - pagado));
        if (abono <= 0) return;
        transaction.update(item.ref, { montoLiquidadoConsignador: Number((pagado + abono).toFixed(2)), updatedAt: timestamp });
        if (venta.cajaId && cajasCerradas.has(venta.cajaId)) deudaFinancieraReducida += abono;
        restante = Number((restante - abono).toFixed(2));
      });
      if (restante > 0.009) throw new Error('El saldo cambió durante la liquidación. Actualiza la pantalla.');
      const estado = { ...ESTADO_FINANCIERO_INICIAL, ...(finanzasSnapshot.exists() ? finanzasSnapshot.data() : {}) };
      if (deudaFinancieraReducida > 0) transaction.set(finanzasRef, {
        ...estado,
        deudaConsignacionPendiente: Math.max(0, Number(estado.deudaConsignacionPendiente ?? 0) - deudaFinancieraReducida),
        updatedAt: timestamp,
      });
      transaction.set(pagoRef, { consignadorNombre: nombre, monto: valor, fecha: new Date().toISOString(), activo: true, createdAt: timestamp });
    });
  }
}
