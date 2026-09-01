import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Cliente } from '../models/cliente.model';
import { CONFIGURACION_FIDELIDAD_DEFAULT, ConfiguracionFidelidad } from '../models/fidelidad.model';
import { Producto } from '../models/producto.model';
import { Reserva, ReservaDetalle, ReservaPago, totalAnticipos } from '../models/reserva.model';
import { MetodoPago, Venta } from '../models/venta.model';
import { removeUndefinedDeep } from '../repositories/firestore.repository';

export interface ReservaInput {
  cliente: Cliente;
  clienteNuevo?: Pick<Cliente, 'nombreCompleto' | 'celular' | 'ci'>;
  detalles: Array<{ producto: Producto; precioAcordado: number }>;
  anticipo?: number;
  metodoAnticipo?: MetodoPago;
  fechaReserva: string;
  fechaVencimiento?: string;
  notas?: string;
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
    await runTransaction(this.firestore, async (tx) => {
      const products = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      products.forEach((snapshot) => {
        if (!snapshot.exists()) throw new Error('Uno de los productos ya no existe.');
        const producto = snapshot.data() as Producto;
        if (producto.activo === false || producto.estado !== 'disponible')
          throw new Error(`El producto "${producto.nombre}" ya no está disponible.`);
      });
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

  async registrarAbono(reservaId: string, pago: ReservaPago): Promise<void> {
    const ref = doc(this.firestore, `reservas/${reservaId}`);
    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa') throw new Error('Solo se pueden abonar reservas activas.');
      const monto = Number(pago.monto);
      if (!Number.isFinite(monto) || monto <= 0 || monto > Number(reserva.saldoPendiente))
        throw new Error('El abono debe ser mayor a 0 y no superar el saldo pendiente.');
      const anticipos = [...(reserva.anticipos ?? []), { ...pago, monto }];
      tx.update(ref, {
        anticipos,
        saldoPendiente: Number(reserva.total) - totalAnticipos({ anticipos }),
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

  async convertirEnVenta(
    reservaId: string,
    metodoPago: MetodoPago,
    fechaVenta: string,
  ): Promise<string[]> {
    const reservaRef = doc(this.firestore, `reservas/${reservaId}`);
    const operacionRef = doc(collection(this.firestore, 'operacionesVenta'));
    const ventaRefs: ReturnType<typeof doc>[] = [];
    const fidelidad = await this.getConfiguracionFidelidad();
    await runTransaction(this.firestore, async (tx) => {
      const snapshot = await tx.get(reservaRef);
      if (!snapshot.exists()) throw new Error('Reserva no encontrada.');
      const reserva = snapshot.data() as Reserva;
      if (reserva.estado !== 'activa')
        throw new Error('Solo se pueden convertir reservas activas.');
      const productRefs = reserva.detalles.map((item) =>
        doc(this.firestore, `productos/${item.productoId}`),
      );
      const products = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      products.forEach((product) => {
        if (!product.exists() || (product.data() as Producto).estado !== 'reservado')
          throw new Error('Uno de los productos ya no está reservado para esta operación.');
      });
      const saldo = Number(reserva.saldoPendiente);
      const clienteRef = doc(this.firestore, `clientes/${reserva.clienteId}`);
      const clienteSnapshot = await tx.get(clienteRef);
      if (!clienteSnapshot.exists()) throw new Error('El cliente de la reserva ya no existe.');
      const cliente = clienteSnapshot.data() as Cliente;
      const puntosGanados = reserva.detalles.length * fidelidad.puntosPorPrenda;
      const puntosConCompra = Number(cliente.puntosDisponibles ?? 0) + puntosGanados;
      tx.update(clienteRef, {
        puntosDisponibles: puntosConCompra % fidelidad.puntosParaRecompensa,
        puntosAcumulados: Number(cliente.puntosAcumulados ?? 0) + puntosGanados,
        recompensasDisponibles:
          Number(cliente.recompensasDisponibles ?? 0) +
          Math.floor(puntosConCompra / fidelidad.puntosParaRecompensa),
        updatedAt: serverTimestamp(),
      });
      const pagos: ReservaPago[] =
        saldo > 0
          ? [...(reserva.anticipos ?? []), { monto: saldo, metodoPago, fecha: fechaVenta }]
          : [...(reserva.anticipos ?? [])];
      const timestamp = serverTimestamp();
      tx.set(
        operacionRef,
        removeUndefinedDeep({
          reservaId,
          total: reserva.total,
          cantidadDetalles: reserva.detalles.length,
          clienteId: reserva.clienteId,
          clienteNombre: reserva.clienteNombre,
          clienteTelefono: reserva.clienteTelefono,
          clienteCi: reserva.clienteCi,
          metodoPago,
          pagos,
          anticipoAplicado: totalAnticipos(reserva),
          fechaVenta,
          notas: reserva.notas || undefined,
          activo: true,
          schemaVersion: 2,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
      reserva.detalles.forEach((detail, index) => {
        const product = products[index].data() as Producto;
        const ventaRef = doc(collection(this.firestore, 'ventas'));
        ventaRefs.push(ventaRef);
        const precioCompra = Number(product.precioCompra ?? 0);
        tx.set(
          ventaRef,
          removeUndefinedDeep<Partial<Venta>>({
            operacionId: operacionRef.id,
            reservaId,
            cantidadDetalles: reserva.detalles.length,
            totalOperacion: reserva.total,
            productoId: detail.productoId,
            loteId: product.loteId,
            nombreProducto: detail.nombreProducto,
            precioCompra,
            precioVenta: detail.precioAcordado,
            ganancia: detail.precioAcordado - precioCompra,
            clienteId: reserva.clienteId,
            clienteNombre: reserva.clienteNombre,
            clienteTelefono: reserva.clienteTelefono,
            clienteCi: reserva.clienteCi,
            metodoPago,
            fechaVenta,
            notas: reserva.notas || undefined,
            activo: true,
            schemaVersion: 4,
            createdAt: timestamp,
            updatedAt: timestamp,
            puntosGanados: fidelidad.puntosPorPrenda,
          }),
        );
        tx.update(productRefs[index], {
          estado: 'vendido',
          precioVenta: detail.precioAcordado,
          updatedAt: timestamp,
        });
        if (product.estadoPublicacion === 'publicado') {
          tx.set(
            doc(this.firestore, `productosPublicos/${detail.productoId}`),
            { estado: 'vendido', precioVenta: detail.precioAcordado, updatedAt: timestamp },
            { merge: true },
          );
        }
      });
      tx.update(reservaRef, {
        estado: 'confirmada',
        saldoPendiente: 0,
        ventaOperacionId: operacionRef.id,
        fechaCierre: fechaVenta,
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
