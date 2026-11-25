import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, runTransaction, serverTimestamp } from '@angular/fire/firestore';
import { Cliente } from '../models/cliente.model';
import { Cotizacion, CotizacionDetalle } from '../models/cotizacion.model';
import { Producto } from '../models/producto.model';
import { Reserva } from '../models/reserva.model';
import { removeUndefinedDeep } from '../repositories/firestore.repository';

export interface CotizacionInput {
  cliente: Cliente;
  detalles: CotizacionDetalle[];
  fechaVencimiento: string;
  notas?: string;
}

@Injectable({ providedIn: 'root' })
export class CotizacionService {
  private readonly firestore = inject(Firestore);

  async crear(input: CotizacionInput): Promise<string> {
    if (!input.cliente.id) throw new Error('Selecciona un cliente registrado para la cotización.');
    if (!input.detalles.length) throw new Error('Agrega al menos una prenda a la cotización.');
    if (new Set(input.detalles.map((item) => item.productoId)).size !== input.detalles.length) {
      throw new Error('No repitas prendas en la cotización.');
    }
    if (input.detalles.some((item) => !Number.isFinite(Number(item.precioCotizado)) || Number(item.precioCotizado) < 0)) {
      throw new Error('Revisa los precios de la cotización.');
    }
    const ref = doc(collection(this.firestore, 'cotizaciones'));
    const timestamp = serverTimestamp();
    const detalles = input.detalles.map((item) => ({ ...item, precioCotizado: Number(item.precioCotizado) }));
    const payload: Partial<Cotizacion> = removeUndefinedDeep({
      clienteId: input.cliente.id,
      clienteNombre: input.cliente.nombreCompleto,
      clienteTelefono: input.cliente.celular,
      detalles,
      total: detalles.reduce((sum, item) => sum + item.precioCotizado, 0),
      fechaCotizacion: new Date().toISOString(),
      fechaVencimiento: input.fechaVencimiento,
      estado: 'vigente',
      notas: input.notas?.trim() || undefined,
      activo: true,
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await runTransaction(this.firestore, async (tx) => {
      const productRefs = detalles.map((item) => doc(this.firestore, `productos/${item.productoId}`));
      const products = await Promise.all(productRefs.map((productRef) => tx.get(productRef)));
      products.forEach((snapshot, index) => {
        if (!snapshot.exists()) throw new Error(`La prenda ${detalles[index].nombreProducto} ya no existe.`);
        const producto = snapshot.data() as Producto;
        if (producto.activo === false || producto.estado !== 'disponible') {
          throw new Error(`La prenda ${producto.nombre} ya no estÃ¡ disponible para cotizar.`);
        }
      });
      tx.set(ref, payload);
    });
    return ref.id;
  }

  async convertirAReserva(cotizacionId: string): Promise<string> {
    const cotizacionRef = doc(this.firestore, `cotizaciones/${cotizacionId}`);
    const reservaRef = doc(collection(this.firestore, 'reservas'));
    await runTransaction(this.firestore, async (tx) => {
      const quoteSnapshot = await tx.get(cotizacionRef);
      if (!quoteSnapshot.exists()) throw new Error('Cotización no encontrada.');
      const quote = quoteSnapshot.data() as Cotizacion;
      if (quote.estado !== 'vigente') throw new Error('Solo se pueden convertir cotizaciones vigentes.');
      if (new Date(quote.fechaVencimiento).getTime() < Date.now()) throw new Error('La cotización venció. Actualízala antes de convertirla.');
      const productRefs = quote.detalles.map((item) => doc(this.firestore, `productos/${item.productoId}`));
      const products = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      products.forEach((snapshot, index) => {
        if (!snapshot.exists()) throw new Error(`La prenda ${quote.detalles[index].nombreProducto} ya no existe.`);
        const product = snapshot.data() as Producto;
        if (product.activo === false || product.estado !== 'disponible') {
          throw new Error(`La prenda ${product.nombre} ya no estÃ¡ disponible; actualiza la cotización.`);
        }
        if (product.consignado && quote.detalles[index].precioCotizado < Number(product.precioCompra ?? 0)) {
          throw new Error(`El precio de ${product.nombre} no puede ser menor al monto acordado con su consignador.`);
        }
      });
      const timestamp = serverTimestamp();
      const total = quote.detalles.reduce((sum, item) => sum + Number(item.precioCotizado), 0);
      tx.set(reservaRef, removeUndefinedDeep<Partial<Reserva>>({
        schemaVersion: 2,
        clienteId: quote.clienteId,
        clienteNombre: quote.clienteNombre,
        clienteTelefono: quote.clienteTelefono,
        detalles: quote.detalles.map((item) => ({
          productoId: item.productoId,
          nombreProducto: item.nombreProducto,
          precioAcordado: Number(item.precioCotizado),
        })),
        total,
        anticipos: [],
        anticiposAplicados: 0,
        saldoPendiente: total,
        estado: 'activa',
        fechaReserva: new Date().toISOString(),
        fechaVencimiento: quote.fechaVencimiento,
        notas: quote.notas,
        cotizacionId,
        activo: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      productRefs.forEach((ref, index) => {
        tx.update(ref, { estado: 'reservado', updatedAt: timestamp });
        if ((products[index].data() as Producto).estadoPublicacion === 'publicado') {
          tx.set(doc(this.firestore, `productosPublicos/${quote.detalles[index].productoId}`), {
            estado: 'reservado', updatedAt: timestamp,
          }, { merge: true });
        }
      });
      tx.update(cotizacionRef, { estado: 'convertida', reservaId: reservaRef.id, updatedAt: timestamp });
    });
    return reservaRef.id;
  }
}
