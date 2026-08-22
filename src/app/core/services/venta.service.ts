import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from '@angular/fire/firestore';
import { Producto } from '../models/producto.model';
import { MetodoPago, Venta, metodosPago } from '../models/venta.model';
import { removeUndefinedDeep } from '../repositories/firestore.repository';

export interface ClienteNuevoInput {
  nombreCompleto: string;
  celular: string;
  ci?: string;
}

export type VentaInput = Pick<
  Venta,
  'clienteId' | 'clienteNombre' | 'clienteTelefono' | 'clienteCi' | 'fechaVenta' | 'notas'
> & {
  precioVenta: number;
  metodoPago: MetodoPago;
  clienteNuevo?: ClienteNuevoInput;
};

export interface VentaDetalleInput {
  producto: Producto;
  precioVenta: number;
}

@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly firestore = inject(Firestore);

  async registrarVenta(producto: Producto, input: VentaInput): Promise<string> {
    const result = await this.registrarVentaMultiple([{ producto, precioVenta: input.precioVenta }], input);
    return result[0];
  }

  async registrarVentaMultiple(detalles: VentaDetalleInput[], input: Omit<VentaInput, 'precioVenta'>): Promise<string[]> {
    if (!detalles.length) throw new Error('Agrega al menos un producto a la venta.');
    this.validateMetodoPago(input.metodoPago);
    const ids = detalles.map(({ producto }) => producto.id);
    if (ids.some((id) => !id)) throw new Error('Uno de los productos no tiene un ID válido.');
    if (new Set(ids).size !== ids.length) throw new Error('Hay productos repetidos en la venta.');

    await Promise.all(ids.map((id) => this.ensureNoActiveSale(id!)));

    const operacionRef = doc(collection(this.firestore, 'operacionesVenta'));
    const ventaRefs = detalles.map(() => doc(collection(this.firestore, 'ventas')));
    const productoRefs = ids.map((id) => doc(this.firestore, `productos/${id}`));
    const clienteRef = input.clienteNuevo
      ? doc(collection(this.firestore, 'clientes'))
      : undefined;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshots = await Promise.all(productoRefs.map((productoRef) => transaction.get(productoRef)));
      const currentProducts = snapshots.map((snapshot) => {
        if (!snapshot.exists()) throw new Error('Producto no encontrado.');
        const current = snapshot.data() as Producto;
        this.validateAvailableProduct(current);
        return current;
      });

      const precios = detalles.map(({ precioVenta }) => Number(precioVenta));
      if (precios.some((precio) => !Number.isFinite(precio) || precio < 0)) throw new Error('Precio de venta inválido.');
      const totalOperacion = precios.reduce((total, precio) => total + precio, 0);
      const timestamp = serverTimestamp();
      const clienteId = input.clienteId || clienteRef?.id;

      if (clienteRef && input.clienteNuevo) {
        transaction.set(clienteRef, removeUndefinedDeep({
          ...input.clienteNuevo,
          activo: true,
          schemaVersion: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
      }

      transaction.set(operacionRef, removeUndefinedDeep({
        total: totalOperacion,
        cantidadDetalles: detalles.length,
        clienteId,
        clienteNombre: input.clienteNombre || undefined,
        clienteTelefono: input.clienteTelefono || undefined,
        clienteCi: input.clienteCi || undefined,
        metodoPago: input.metodoPago,
        fechaVenta: input.fechaVenta,
        notas: input.notas || undefined,
        activo: true,
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));

      const loteIds = [...new Set(currentProducts.map((p) => p.loteId).filter((id): id is string => !!id))];
      const lotesCompletados: string[] = [];
      for (const loteId of loteIds) {
        const productosLoteSnap = await getDocs(
          query(collection(this.firestore, 'productos'), where('loteId', '==', loteId))
        );
        const otrosDisponibles = productosLoteSnap.docs.filter((docSnap) => {
          const data = docSnap.data() as Producto;
          return data.activo !== false && data.estado === 'disponible' && !ids.includes(docSnap.id);
        });
        if (otrosDisponibles.length === 0) {
          lotesCompletados.push(loteId);
        }
      }

      currentProducts.forEach((current, index) => {
        const precioCompra = this.readPurchasePrice(current);
        const precioVenta = precios[index];
        transaction.set(ventaRefs[index], removeUndefinedDeep<Partial<Venta>>({
          operacionId: operacionRef.id, cantidadDetalles: detalles.length, totalOperacion,
          productoId: snapshots[index].id, loteId: current.loteId || undefined,
          nombreProducto: current.nombre, precioCompra, precioVenta,
          ganancia: precioVenta - precioCompra,
          clienteId,
          clienteNombre: input.clienteNombre || undefined,
          clienteTelefono: input.clienteTelefono || undefined,
          clienteCi: input.clienteCi || undefined,
          metodoPago: input.metodoPago, fechaVenta: input.fechaVenta,
          notas: input.notas || undefined, activo: true, schemaVersion: 3,
          createdAt: timestamp, updatedAt: timestamp,
        }));
        transaction.update(productoRefs[index], { estado: 'vendido', precioVenta, updatedAt: timestamp });
        if (current.estadoPublicacion === 'publicado') {
          transaction.set(
            doc(this.firestore, `productosPublicos/${snapshots[index].id}`),
            { estado: 'vendido', precioVenta, updatedAt: timestamp },
            { merge: true },
          );
        }
      });

      lotesCompletados.forEach((loteId) => {
        transaction.update(doc(this.firestore, `lotes/${loteId}`), { activo: false, updatedAt: timestamp });
      });
    });

    return ventaRefs.map((ref) => ref.id);
  }

  async editarVenta(detalles: Venta[], input: Omit<VentaInput, 'precioVenta'> & { precios: Record<string, number> }): Promise<void> {
    if (!detalles.length || detalles.some((detalle) => !detalle.id)) throw new Error('La venta no tiene detalles válidos.');
    this.validateMetodoPago(input.metodoPago);
    const precios = detalles.map((detalle) => Number(input.precios[detalle.id!]));
    if (precios.some((precio) => !Number.isFinite(precio) || precio < 0)) throw new Error('Precio de venta inválido.');
    const totalOperacion = precios.reduce((total, precio) => total + precio, 0);
    const refs = detalles.map((detalle) => doc(this.firestore, `ventas/${detalle.id}`));
    const operacionId = detalles[0].operacionId;

    await runTransaction(this.firestore, async (transaction) => {
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      if (snapshots.some((snapshot) => !snapshot.exists())) throw new Error('Uno de los detalles de venta ya no existe.');
      const timestamp = serverTimestamp();
        snapshots.forEach((snapshot, index) => {
          const current = snapshot.data() as Venta;
          const productoRef = doc(this.firestore, `productos/${current.productoId}`);
          transaction.update(refs[index], removeUndefinedDeep({
            precioVenta: precios[index], ganancia: precios[index] - Number(current.precioCompra ?? 0),
            totalOperacion, metodoPago: input.metodoPago, fechaVenta: input.fechaVenta,
            clienteId: input.clienteId || deleteField(),
            clienteNombre: input.clienteNombre || deleteField(),
            clienteTelefono: input.clienteTelefono || deleteField(),
            clienteCi: input.clienteCi || deleteField(),
            notas: input.notas || deleteField(), updatedAt: timestamp,
          }));
          transaction.update(productoRef, { precioVenta: precios[index], updatedAt: timestamp });
        });
      if (operacionId) transaction.update(doc(this.firestore, `operacionesVenta/${operacionId}`), removeUndefinedDeep({
        total: totalOperacion, metodoPago: input.metodoPago, fechaVenta: input.fechaVenta,
        clienteId: input.clienteId || deleteField(),
        clienteNombre: input.clienteNombre || deleteField(),
        clienteTelefono: input.clienteTelefono || deleteField(),
        clienteCi: input.clienteCi || deleteField(),
        notas: input.notas || deleteField(), updatedAt: timestamp,
      }));
    });
  }

  async editarVentaCompleta(originales: Venta[], nuevos: VentaDetalleInput[], input: Omit<VentaInput, 'precioVenta'>): Promise<void> {
    if (!originales.length || !nuevos.length) throw new Error('La venta debe conservar al menos un producto.');
    this.validateMetodoPago(input.metodoPago);
    const nuevosIds = nuevos.map(item => item.producto.id).filter((id): id is string => !!id);
    if (nuevosIds.length !== nuevos.length || new Set(nuevosIds).size !== nuevosIds.length) throw new Error('La selección de productos no es válida.');
    const originalesPorProducto = new Map(originales.map(item => [item.productoId, item]));
    const agregados = nuevosIds.filter(id => !originalesPorProducto.has(id));
    await Promise.all(agregados.map(id => this.ensureNoActiveSale(id)));

    const todosIds = [...new Set([...originales.map(item => item.productoId), ...nuevosIds])];
    const productoRefs = new Map(todosIds.map(id => [id, doc(this.firestore, `productos/${id}`)]));
    const operacionId = originales[0].operacionId ?? originales[0].id!;
    const operacionRef = doc(this.firestore, `operacionesVenta/${operacionId}`);
    const nuevosVentaRefs = new Map(agregados.map(id => [id, doc(collection(this.firestore, 'ventas'))]));
    const clienteRef = input.clienteNuevo
      ? doc(collection(this.firestore, 'clientes'))
      : undefined;
    const precios = nuevos.map(item => Number(item.precioVenta));
    if (precios.some(precio => !Number.isFinite(precio) || precio < 0)) throw new Error('Precio de venta inválido.');

    await runTransaction(this.firestore, async transaction => {
      const productSnapshots = await Promise.all(todosIds.map(id => transaction.get(productoRefs.get(id)!)));
      const products = new Map(productSnapshots.map(snapshot => {
        if (!snapshot.exists()) throw new Error('Uno de los productos ya no existe.');
        return [snapshot.id, snapshot.data() as Producto];
      }));
      agregados.forEach(id => this.validateAvailableProduct(products.get(id)!));
      const totalOperacion = precios.reduce((sum, price) => sum + price, 0);
      const timestamp = serverTimestamp();
      const clienteId = input.clienteId || clienteRef?.id;
      if (clienteRef && input.clienteNuevo) {
        transaction.set(clienteRef, removeUndefinedDeep({
          ...input.clienteNuevo,
          activo: true,
          schemaVersion: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));
      }
      const common = { operacionId, cantidadDetalles:nuevos.length, totalOperacion, metodoPago:input.metodoPago,
        fechaVenta:input.fechaVenta, clienteId:clienteId||deleteField(),
        clienteNombre:input.clienteNombre||deleteField(), clienteTelefono:input.clienteTelefono||deleteField(),
        clienteCi:input.clienteCi||deleteField(), notas:input.notas||deleteField(), updatedAt:timestamp };

      for (const original of originales) {
        if (!nuevosIds.includes(original.productoId)) {
          transaction.delete(doc(this.firestore, `ventas/${original.id}`));
          transaction.update(productoRefs.get(original.productoId)!, { estado:'disponible', updatedAt:timestamp });
        }
      }
      nuevos.forEach((item,index) => {
        const product = products.get(item.producto.id!)!;
        const existing = originalesPorProducto.get(item.producto.id!);
        const ventaData = { ...common, productoId:item.producto.id!, loteId:product.loteId||deleteField(),
          nombreProducto:product.nombre, precioCompra:this.readPurchasePrice(product), precioVenta:precios[index],
          ganancia:precios[index]-this.readPurchasePrice(product), activo:true, schemaVersion:3 };
        if (existing?.id) transaction.update(doc(this.firestore, `ventas/${existing.id}`), ventaData);
        if (existing?.id) {
          transaction.update(productoRefs.get(item.producto.id!)!, { precioVenta: precios[index], updatedAt: timestamp });
        } else {
          transaction.set(nuevosVentaRefs.get(item.producto.id!)!, removeUndefinedDeep({
            ...ventaData,
            loteId: product.loteId || undefined,
            clienteId: clienteId || undefined,
            clienteNombre: input.clienteNombre || undefined,
            clienteTelefono: input.clienteTelefono || undefined,
            clienteCi: input.clienteCi || undefined,
            notas: input.notas || undefined,
            createdAt: timestamp,
          }));
          transaction.update(productoRefs.get(item.producto.id!)!, { estado:'vendido', precioVenta:precios[index], updatedAt:timestamp });
          if (product.estadoPublicacion === 'publicado') {
            transaction.set(
              doc(this.firestore, `productosPublicos/${item.producto.id!}`),
              { estado: 'vendido', precioVenta: precios[index], updatedAt: timestamp },
              { merge: true },
            );
          }
        }
      });
      transaction.set(operacionRef, { total:totalOperacion, cantidadDetalles:nuevos.length, metodoPago:input.metodoPago,
        fechaVenta:input.fechaVenta, clienteId:clienteId||deleteField(), clienteNombre:input.clienteNombre||deleteField(),
        clienteTelefono:input.clienteTelefono||deleteField(), clienteCi:input.clienteCi||deleteField(),
        notas:input.notas||deleteField(), activo:true, schemaVersion:1, updatedAt:timestamp }, { merge:true });
    });
  }

  private validateAvailableProduct(producto: Producto): void {
    if (producto.activo === false) {
      throw new Error('Producto inactivo.');
    }

    switch (producto.estado) {
      case 'disponible':
        return;
      case 'vendido':
        throw new Error('Producto ya vendido.');
      case 'reservado':
        throw new Error('Producto reservado.');
      default:
        throw new Error('El producto no está disponible.');
    }
  }

  private validateMetodoPago(metodoPago: MetodoPago): void {
    if (!metodosPago.includes(metodoPago)) {
      throw new Error('El metodo de pago debe ser efectivo o QR.');
    }
  }

  private async ensureNoActiveSale(productoId: string): Promise<void> {
    const ventas = await getDocs(
      query(collection(this.firestore, 'ventas'), where('productoId', '==', productoId)),
    );
    if (ventas.docs.some((venta) => venta.data()['activo'] !== false)) {
      throw new Error('Producto ya vendido.');
    }
  }

  private readPurchasePrice(producto: Producto): number {
    if (producto.precioCompra === undefined) {
      return 0;
    }

    const precioCompra = producto.precioCompra;
    if (typeof precioCompra !== 'number' || !Number.isFinite(precioCompra)) {
      throw new Error('Precio de compra inválido.');
    }
    return precioCompra;
  }
}
