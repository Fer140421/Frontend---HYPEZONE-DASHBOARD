import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Cliente } from '../models/cliente.model';
import { CONFIGURACION_FIDELIDAD_DEFAULT, ConfiguracionFidelidad } from '../models/fidelidad.model';
import { Producto } from '../models/producto.model';
import { Reserva, ReservaDetalle, ReservaPago, totalAnticipos, totalAnticiposDisponibles } from '../models/reserva.model';
import { MetodoPago, Venta } from '../models/venta.model';
import { removeUndefinedDeep } from '../repositories/firestore.repository';

export interface ReservaInput {
  cliente: Cliente;
  clienteNuevo?: Pick<Cliente, 'nombreCompleto' | 'celular' | 'ci'>;
  detalles: Array<{ producto: Producto; precioAcordado: number }>;
  anticipo?: number;
  metodoAnticipo?: MetodoPago;
  cajaIdAnticipo?: string;
  fechaReserva: string;
  fechaVencimiento?: string;
  notas?: string;
}

export interface ReservaEditInput {
  cliente: Cliente;
  clienteNuevo?: Pick<Cliente, 'nombreCompleto' | 'celular' | 'ci'>;
  detalles: Array<{ producto: Producto; precioAcordado: number }>;
  fechaVencimiento?: string;
  notas?: string;
}

export interface ConvertirReservaCajaContext {
  cajaId?: string;
  usuarioVentaId?: string;
  usuarioVentaNombre?: string;
}

export interface PagoReservaConCaja extends ReservaPago {
  cajaId: string;
}

@Injectable({ providedIn: 'root' })
export class ReservaService {
  private readonly firestore = inject(Firestore);

  async crear(input: ReservaInput): Promise<string> {
    if (!input.cliente.id && !input.clienteNuevo)
      throw new Error('Selecciona o registra un cliente para la reserva.');
    if (!input.detalles.length) throw new Error('Agrega al menos un producto.');
    if (!input.fechaVencimiento || Number.isNaN(new Date(input.fechaVencimiento).getTime())) {
      throw new Error('La fecha límite de la reserva es obligatoria.');
    }
    const ids = input.detalles.map(({ producto }) => producto.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
      throw new Error('La selección de productos no es válida.');
    const details = input.detalles.map(({ producto, precioAcordado }): ReservaDetalle => ({
      productoId: producto.id!,
      nombreProducto: producto.nombre,
      precioAcordado: Number(precioAcordado),
    }));
    const total = details.reduce((sum, item) => sum + item.precioAcordado, 0);
    const anticipo = Number(input.anticipo ?? 0);
    if (details.some((item) => !Number.isFinite(item.precioAcordado) || item.precioAcordado < 0))
      throw new Error('El precio acordado no es válido.');
    if (!Number.isFinite(anticipo) || anticipo < 0 || anticipo > total)
      throw new Error('El anticipo debe estar entre 0 y el total.');
    const reservaRef = doc(collection(this.firestore, 'reservas'));
    const clienteRef = input.cliente.id
      ? doc(this.firestore, `clientes/${input.cliente.id}`)
      : doc(collection(this.firestore, 'clientes'));
    const productRefs = ids.map((id) => doc(this.firestore, `productos/${id}`));
    const cajaRef = anticipo > 0 && input.cajaIdAnticipo
      ? doc(this.firestore, `cajas/${input.cajaIdAnticipo}`)
      : undefined;
    if (anticipo > 0 && !cajaRef) throw new Error('Abre una caja para registrar el anticipo.');
    await runTransaction(this.firestore, async (tx) => {
      const products = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      products.forEach((snapshot) => {
        if (!snapshot.exists()) throw new Error('Uno de los productos ya no existe.');
        const producto = snapshot.data() as Producto;
        if (producto.activo === false || producto.estado !== 'disponible')
          throw new Error(`El producto "${producto.nombre}" ya no está disponible.`);
      });
      if (cajaRef) {
        const caja = await tx.get(cajaRef);
        if (!caja.exists() || caja.data()?.['estado'] !== 'abierta') {
          throw new Error('La caja del anticipo ya no estÃ¡ abierta. Actualiza e intenta de nuevo.');
        }
      }
      const timestamp = serverTimestamp();
      if (input.clienteNuevo) {
        tx.set(
          clienteRef,
          removeUndefinedDeep({
            ...input.clienteNuevo,
            puntosDisponibles: 0,
            puntosAcumulados: 0,
            recompensasDisponibles: 0,
            activo: true,
            schemaVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        );
      }
      const anticipos: ReservaPago[] = anticipo
        ? [
            {
              monto: anticipo,
              metodoPago: input.metodoAnticipo ?? 'efectivo',
              fecha: input.fechaReserva,
              cajaId: input.cajaIdAnticipo,
            },
          ]
        : [];
      tx.set(
        reservaRef,
        removeUndefinedDeep<Reserva>({
          schemaVersion: 1,
          clienteId: clienteRef.id,
          clienteNombre: input.cliente.nombreCompleto,
          clienteTelefono: input.cliente.celular,
          clienteCi: input.cliente.ci,
          detalles: details,
          total,
          anticipos,
          saldoPendiente: total - anticipo,
          estado: 'activa',
          fechaReserva: input.fechaReserva,
          fechaVencimiento: input.fechaVencimiento,
          notas: input.notas || undefined,
          activo: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
      productRefs.forEach((ref, index) => {
        tx.update(ref, { estado: 'reservado', updatedAt: timestamp });
        if ((products[index].data() as Producto).estadoPublicacion === 'publicado') {
          tx.set(
            doc(this.firestore, `productosPublicos/${ids[index]}`),
            { estado: 'reservado', updatedAt: timestamp },
            { merge: true },
          );
        }
      });
    });
    return reservaRef.id;
  }

  async editar(reservaId: string, input: ReservaEditInput): Promise<void> {
    if (!input.cliente.id && !input.clienteNuevo)
      throw new Error('Selecciona o registra un cliente para la reserva.');
    if (!input.detalles.length) throw new Error('Agrega al menos un producto.');
    if (!input.fechaVencimiento || Number.isNaN(new Date(input.fechaVencimiento).getTime())) {
      throw new Error('La fecha límite de la reserva es obligatoria.');
    }
    const newIds = input.detalles.map(({ producto }) => producto.id);
    if (newIds.some((id) => !id) || new Set(newIds).size !== newIds.length)
      throw new Error('La selección de productos no es válida.');

    const details = input.detalles.map(({ producto, precioAcordado }): ReservaDetalle => ({
      productoId: producto.id!,
      nombreProducto: producto.nombre,
      precioAcordado: Number(precioAcordado),
    }));
    if (details.some((item) => !Number.isFinite(item.precioAcordado) || item.precioAcordado < 0)) {
      throw new Error('El precio acordado no es válido.');
    }
    const total = details.reduce((sum, item) => sum + item.precioAcordado, 0);

    const reservaRef = doc(this.firestore, `reservas/${reservaId}`);
    const clienteRef = input.cliente.id
      ? doc(this.firestore, `clientes/${input.cliente.id}`)
      : doc(collection(this.firestore, 'clientes'));

    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(reservaRef);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa') throw new Error('Solo se pueden editar reservas activas.');

      const anticiposPagados = totalAnticiposDisponibles(reserva);
      if (total < anticiposPagados) {
        throw new Error(
          `El nuevo total (Bs ${total}) no puede ser menor al total de anticipos ya registrados (Bs ${anticiposPagados}).`,
        );
      }
      const saldoPendiente = total - anticiposPagados;

      const oldIds = reserva.detalles.map((d) => d.productoId);
      const removedIds = oldIds.filter((id) => !newIds.includes(id));
      const addedIds = newIds.filter((id): id is string => !!id && !oldIds.includes(id));

      const addedRefs = addedIds.map((id) => doc(this.firestore, `productos/${id}`));
      const addedSnapshots = await Promise.all(addedRefs.map((ref) => tx.get(ref)));
      addedSnapshots.forEach((productSnap) => {
        if (!productSnap.exists()) throw new Error('Uno de los productos agregados ya no existe.');
        const prod = productSnap.data() as Producto;
        if (prod.activo === false || prod.estado !== 'disponible') {
          throw new Error(`El producto "${prod.nombre}" ya no está disponible.`);
        }
      });

      const removedRefs = removedIds.map((id) => doc(this.firestore, `productos/${id}`));
      const removedSnapshots = await Promise.all(removedRefs.map((ref) => tx.get(ref)));

      const timestamp = serverTimestamp();

      if (input.clienteNuevo) {
        tx.set(
          clienteRef,
          removeUndefinedDeep({
            ...input.clienteNuevo,
            puntosDisponibles: 0,
            puntosAcumulados: 0,
            recompensasDisponibles: 0,
            activo: true,
            schemaVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        );
      }

      // Liberar productos removidos
      removedRefs.forEach((ref, index) => {
        const prod = removedSnapshots[index].data() as Producto | undefined;
        tx.update(ref, { estado: 'disponible', updatedAt: timestamp });
        if (prod?.estadoPublicacion === 'publicado') {
          tx.set(
            doc(this.firestore, `productosPublicos/${ref.id}`),
            { estado: 'disponible', updatedAt: timestamp },
            { merge: true },
          );
        }
      });

      // Reservar productos nuevos
      addedRefs.forEach((ref, index) => {
        const prod = addedSnapshots[index].data() as Producto;
        tx.update(ref, { estado: 'reservado', updatedAt: timestamp });
        if (prod.estadoPublicacion === 'publicado') {
          tx.set(
            doc(this.firestore, `productosPublicos/${ref.id}`),
            { estado: 'reservado', updatedAt: timestamp },
            { merge: true },
          );
        }
      });

      // Actualizar reserva
      tx.update(
        reservaRef,
        removeUndefinedDeep({
          clienteId: clienteRef.id,
          clienteNombre: input.cliente.nombreCompleto,
          clienteTelefono: input.cliente.celular,
          clienteCi: input.cliente.ci || deleteField(),
          detalles: details,
          total,
          saldoPendiente,
          fechaVencimiento: input.fechaVencimiento,
          notas: input.notas || deleteField(),
          updatedAt: timestamp,
        }),
      );
    });
  }

  async registrarAbono(reservaId: string, pago: ReservaPago): Promise<void> {
    const ref = doc(this.firestore, `reservas/${reservaId}`);
    if (!pago.cajaId) throw new Error('Abre una caja antes de registrar un abono.');
    const cajaRef = doc(this.firestore, `cajas/${pago.cajaId}`);
    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa') throw new Error('Solo se pueden abonar reservas activas.');
      const monto = Number(pago.monto);
      if (!Number.isFinite(monto) || monto <= 0 || monto > Number(reserva.saldoPendiente))
        throw new Error('El abono debe ser mayor a 0 y no superar el saldo pendiente.');
      const caja = await tx.get(cajaRef);
      if (!caja.exists() || caja.data()?.['estado'] !== 'abierta') {
        throw new Error('La caja del abono ya no estÃ¡ abierta. Actualiza e intenta de nuevo.');
      }
      const anticipos = [...(reserva.anticipos ?? []), removeUndefinedDeep({ ...pago, monto })];
      tx.update(ref, {
        anticipos,
        saldoPendiente: Math.max(0, Number(reserva.total) - totalAnticipos({ anticipos }) + Number(reserva.anticiposAplicados ?? 0)),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async cancelar(reservaId: string): Promise<void> {
    const ref = doc(this.firestore, `reservas/${reservaId}`);
    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa') throw new Error('Solo se pueden cancelar reservas activas.');
      const refs = reserva.detalles.map((item) =>
        doc(this.firestore, `productos/${item.productoId}`),
      );
      const products = await Promise.all(refs.map((item) => tx.get(item)));
      const timestamp = serverTimestamp();
      products.forEach((product, index) => {
        if (product.exists() && (product.data() as Producto).estado === 'reservado') {
          tx.update(refs[index], { estado: 'disponible', updatedAt: timestamp });
          if ((product.data() as Producto).estadoPublicacion === 'publicado') {
            tx.set(
              doc(this.firestore, `productosPublicos/${refs[index].id}`),
              { estado: 'disponible', updatedAt: timestamp },
              { merge: true },
            );
          }
        }
      });
      tx.update(ref, {
        estado: 'cancelada',
        fechaCierre: new Date().toISOString(),
        updatedAt: timestamp,
      });
    });
  }

  async convertirPrendasEnVenta(
    reservaId: string,
    productoIds: string[],
    pagoNuevo: PagoReservaConCaja | undefined,
    fechaVenta: string,
    cajaContext: ConvertirReservaCajaContext,
  ): Promise<string[]> {
    const ids = [...new Set(productoIds.filter(Boolean))];
    if (!ids.length) throw new Error('Selecciona al menos una prenda para convertir.');
    if (!cajaContext.cajaId) throw new Error('Abre una caja para confirmar la venta.');
    const reservaRef = doc(this.firestore, `reservas/${reservaId}`);
    const cajaRef = doc(this.firestore, `cajas/${cajaContext.cajaId}`);
    const operacionRef = doc(collection(this.firestore, 'operacionesVenta'));
    const fidelidad = await this.getConfiguracionFidelidad();
    const ventaRefs: ReturnType<typeof doc>[] = [];

    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(reservaRef);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa') throw new Error('Solo se pueden convertir reservas activas.');
      const selected = reserva.detalles.filter((detail) => ids.includes(detail.productoId));
      if (selected.length !== ids.length) throw new Error('Una prenda ya no pertenece a esta reserva. Actualiza e intenta de nuevo.');
      const selectedTotal = selected.reduce((sum, detail) => sum + Number(detail.precioAcordado), 0);
      const payment = pagoNuevo ? removeUndefinedDeep({ ...pagoNuevo, monto: Number(pagoNuevo.monto) }) : undefined;
      if (payment && (payment.cajaId !== cajaContext.cajaId || !Number.isFinite(payment.monto) || payment.monto < 0)) {
        throw new Error('El pago final no es vÃ¡lido para esta caja.');
      }
      if (payment && payment.monto > Number(reserva.saldoPendiente) + 0.009) {
        throw new Error('El pago supera el saldo pendiente de la reserva.');
      }
      const availableCredit = Math.max(0, totalAnticipos(reserva) - Number(reserva.anticiposAplicados ?? 0));
      const shortfall = Math.max(0, selectedTotal - availableCredit);
      if (shortfall > 0 && (!payment || payment.monto + 0.009 < shortfall)) {
        throw new Error(`Falta cobrar Bs ${shortfall.toFixed(2)} para las prendas seleccionadas.`);
      }

      const cajaSnapshot = await tx.get(cajaRef);
      if (!cajaSnapshot.exists() || cajaSnapshot.data()?.['estado'] !== 'abierta') {
        throw new Error('La caja ya no estÃ¡ abierta. Actualiza e intenta de nuevo.');
      }
      const productRefs = selected.map((detail) => doc(this.firestore, `productos/${detail.productoId}`));
      const products = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      products.forEach((product, index) => {
        if (!product.exists() || (product.data() as Producto).estado !== 'reservado') {
          throw new Error(`La prenda ${selected[index].nombreProducto} ya no estÃ¡ reservada.`);
        }
        const item = product.data() as Producto;
        if (item.consignado && selected[index].precioAcordado < Number(item.precioCompra ?? 0)) {
          throw new Error(`El precio acordado para ${selected[index].nombreProducto} no puede ser menor al monto del consignador.`);
        }
      });
      const clienteRef = doc(this.firestore, `clientes/${reserva.clienteId}`);
      const clienteSnapshot = await tx.get(clienteRef);
      if (!clienteSnapshot.exists()) throw new Error('El cliente de la reserva ya no existe.');

      const timestamp = serverTimestamp();
      const newPayments = payment && payment.monto > 0 ? [...(reserva.anticipos ?? []), payment] : [...(reserva.anticipos ?? [])];
      const appliedNow = Math.min(selectedTotal, availableCredit + Number(payment?.monto ?? 0));
      const totalApplied = Number(reserva.anticiposAplicados ?? 0) + appliedNow;
      const remainingDetails = reserva.detalles.filter((detail) => !ids.includes(detail.productoId));
      const remainingTotal = remainingDetails.reduce((sum, detail) => sum + Number(detail.precioAcordado), 0);
      const availableAfter = Math.max(0, totalAnticipos({ anticipos: newPayments }) - totalApplied);
      const remainingBalance = Math.max(0, remainingTotal - availableAfter);
      const client = clienteSnapshot.data() as Cliente;
      const loyaltyPoints = selected.length * fidelidad.puntosPorPrenda;
      const pointsWithPurchase = Number(client.puntosDisponibles ?? 0) + loyaltyPoints;
      tx.update(clienteRef, {
        puntosDisponibles: pointsWithPurchase % fidelidad.puntosParaRecompensa,
        puntosAcumulados: Number(client.puntosAcumulados ?? 0) + loyaltyPoints,
        recompensasDisponibles: Number(client.recompensasDisponibles ?? 0) + Math.floor(pointsWithPurchase / fidelidad.puntosParaRecompensa),
        updatedAt: timestamp,
      });
      tx.set(operacionRef, removeUndefinedDeep({
        reservaId, total: selectedTotal, cantidadDetalles: selected.length,
        clienteId: reserva.clienteId, clienteNombre: reserva.clienteNombre,
        clienteTelefono: reserva.clienteTelefono, clienteCi: reserva.clienteCi,
        metodoPago: payment?.metodoPago ?? 'efectivo',
        pagos: payment && payment.monto > 0 ? [payment] : [],
        anticipoAplicado: appliedNow, saldoCobrado: payment?.monto ?? 0,
        fechaVenta, notas: reserva.notas || undefined, cajaId: cajaContext.cajaId,
        usuarioVentaId: cajaContext.usuarioVentaId || undefined,
        usuarioVentaNombre: cajaContext.usuarioVentaNombre || undefined,
        activo: true, schemaVersion: 3, createdAt: timestamp, updatedAt: timestamp,
      }));

      selected.forEach((detail, index) => {
        const product = products[index].data() as Producto;
        const precioCompra = Number(product.precioCompra ?? 0);
        const ventaRef = doc(collection(this.firestore, 'ventas'));
        ventaRefs.push(ventaRef);
        tx.set(ventaRef, removeUndefinedDeep<Partial<Venta>>({
          operacionId: operacionRef.id, reservaId, cantidadDetalles: selected.length,
          totalOperacion: selectedTotal, productoId: detail.productoId, loteId: product.loteId,
          nombreProducto: detail.nombreProducto, marcaProducto: product.marca || undefined,
          codigoProducto: product.codigo || undefined, categoriaProducto: product.categoria || undefined,
          precioCompra, precioVenta: detail.precioAcordado, ganancia: detail.precioAcordado - precioCompra,
          consignado: product.consignado === true,
          consignadorNombre: product.consignado ? product.consignadorNombre : undefined,
          montoPendienteConsignador: product.consignado ? precioCompra : undefined,
          clienteId: reserva.clienteId, clienteNombre: reserva.clienteNombre,
          clienteTelefono: reserva.clienteTelefono, clienteCi: reserva.clienteCi,
          metodoPago: payment?.metodoPago ?? 'efectivo', fechaVenta, notas: reserva.notas || undefined,
          cajaId: cajaContext.cajaId, usuarioVentaId: cajaContext.usuarioVentaId || undefined,
          usuarioVentaNombre: cajaContext.usuarioVentaNombre || undefined,
          activo: true, schemaVersion: 5, createdAt: timestamp, updatedAt: timestamp,
          puntosGanados: fidelidad.puntosPorPrenda,
        }));
        tx.update(productRefs[index], { estado: 'vendido', precioVenta: detail.precioAcordado, updatedAt: timestamp });
        if (product.estadoPublicacion === 'publicado') {
          tx.set(doc(this.firestore, `productosPublicos/${detail.productoId}`), {
            estado: 'vendido', precioVenta: detail.precioAcordado, updatedAt: timestamp,
          }, { merge: true });
        }
      });
      tx.update(reservaRef, {
        detalles: remainingDetails, total: remainingTotal, anticipos: newPayments,
        anticiposAplicados: totalApplied, saldoPendiente: remainingBalance,
        estado: remainingDetails.length ? 'activa' : 'confirmada',
        ...(remainingDetails.length ? {} : { ventaOperacionId: operacionRef.id, fechaCierre: fechaVenta }),
        updatedAt: timestamp,
      });
    });
    return ventaRefs.map((ref) => ref.id);
  }

  private async getConfiguracionFidelidad(): Promise<ConfiguracionFidelidad> {
    const snapshot = await getDoc(doc(this.firestore, 'configuracion/fidelidad'));
    return {
      ...CONFIGURACION_FIDELIDAD_DEFAULT,
      ...(snapshot.data() as Partial<ConfiguracionFidelidad> | undefined),
    };
  }
}
