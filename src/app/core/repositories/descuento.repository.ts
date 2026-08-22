import { Injectable, inject } from '@angular/core';
import { Firestore, collection, deleteField, doc, getDoc, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { Descuento } from '../models/descuento.model';
import { Producto, precioProducto } from '../models/producto.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class DescuentoRepository extends FirestoreRepository<Descuento> {
  private readonly db = inject(Firestore);

  constructor() { super('descuentos'); }

  async crearConProductos(input: Pick<Descuento, 'nombre' | 'tipo' | 'valor'>, productos: Producto[]): Promise<string> {
    const descuentoRef = doc(collection(this.db, 'descuentos'));
    await this.escribirProductos(descuentoRef.id, input, productos, true);
    return descuentoRef.id;
  }

  async agregarProductos(descuento: Descuento, productos: Producto[]): Promise<void> {
    if (!descuento.id) throw new Error('El descuento no tiene un ID válido.');
    await this.escribirProductos(descuento.id, descuento, productos, false);
  }

  async actualizarDescuento(descuento: Descuento, input: Pick<Descuento, 'nombre' | 'tipo' | 'valor'>, productos: Producto[]): Promise<void> {
    if (!descuento.id) throw new Error('El descuento no tiene un ID válido.');
    if (!productos.length) {
      await this.update(descuento.id, input);
      return;
    }
    await this.escribirProductos(descuento.id, input, productos, false);
  }

  async quitarProducto(descuentoId: string, productoId: string): Promise<void> {
    const producto = await getDoc(doc(this.db, `productos/${productoId}`));
    const batch = writeBatch(this.db);
    const timestamp = serverTimestamp();
    batch.update(doc(this.db, `productos/${productoId}`), { descuentoId: deleteField(), precioOferta: deleteField(), updatedAt: timestamp });
    if (producto.exists() && (producto.data() as Producto).estadoPublicacion !== 'pendiente') {
      batch.set(doc(this.db, `productosPublicos/${productoId}`), { precioOferta: deleteField(), updatedAt: timestamp }, { merge: true });
    }
    batch.update(doc(this.db, `descuentos/${descuentoId}`), { updatedAt: timestamp });
    await batch.commit();
  }

  async finalizar(descuentoId: string, productoIds: string[]): Promise<void> {
    await this.limpiarProductos(descuentoId, productoIds, false);
  }

  async eliminar(descuentoId: string, productoIds: string[]): Promise<void> {
    await this.limpiarProductos(descuentoId, productoIds, true);
  }

  private async escribirProductos(
    descuentoId: string,
    descuento: Pick<Descuento, 'nombre' | 'tipo' | 'valor'>,
    productos: Producto[],
    crear: boolean,
  ): Promise<void> {
    if (!productos.length) throw new Error('Selecciona al menos un producto.');
    const unique = [...new Map(productos.filter((producto) => producto.id).map((producto) => [producto.id!, producto])).values()];

    // One product writes to private and public collections; 249 leaves space for the campaign document.
    for (let index = 0; index < unique.length; index += 249) {
      const batch = writeBatch(this.db);
      const timestamp = serverTimestamp();
      const group = unique.slice(index, index + 249);
      const campaignRef = doc(this.db, `descuentos/${descuentoId}`);
      if (crear && index === 0) {
        batch.set(campaignRef, { ...descuento, activo: true, createdAt: timestamp, updatedAt: timestamp });
      } else {
        batch.update(campaignRef, { ...(index === 0 ? descuento : {}), updatedAt: timestamp });
      }
      for (const producto of group) {
        const precioOferta = this.precioOferta(producto, descuento.tipo, descuento.valor);
        if (precioOferta >= precioProducto(producto)) throw new Error(`La oferta de "${producto.nombre}" debe ser menor al precio de venta.`);
        batch.update(doc(this.db, `productos/${producto.id}`), { descuentoId, precioOferta, updatedAt: timestamp });
        if (producto.estadoPublicacion === 'publicado') {
          batch.set(doc(this.db, `productosPublicos/${producto.id}`), { precioOferta, updatedAt: timestamp }, { merge: true });
        }
      }
      await batch.commit();
    }
  }

  private precioOferta(producto: Producto, tipo: Descuento['tipo'], valor: number): number {
    const precio = tipo === 'porcentaje' ? precioProducto(producto) * (1 - valor / 100) : valor;
    return Math.round(precio * 100) / 100;
  }

  private async limpiarProductos(descuentoId: string, productIds: string[], deleteCampaign: boolean): Promise<void> {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) {
      const batch = writeBatch(this.db);
      const ref = doc(this.db, `descuentos/${descuentoId}`);
      deleteCampaign ? batch.delete(ref) : batch.update(ref, { activo: false, updatedAt: serverTimestamp() });
      await batch.commit();
      return;
    }

    for (let index = 0; index < ids.length; index += 249) {
      const batch = writeBatch(this.db);
      const timestamp = serverTimestamp();
      const group = ids.slice(index, index + 249);
      const productos = await Promise.all(group.map((id) => getDoc(doc(this.db, `productos/${id}`))));
      const campaignRef = doc(this.db, `descuentos/${descuentoId}`);
      const isLastBatch = index + 249 >= ids.length;
      if (deleteCampaign && isLastBatch) batch.delete(campaignRef);
      else batch.update(campaignRef, { ...(deleteCampaign ? {} : { activo: false }), updatedAt: timestamp });

      for (let productIndex = 0; productIndex < group.length; productIndex++) {
        const id = group[productIndex];
        batch.update(doc(this.db, `productos/${id}`), { descuentoId: deleteField(), precioOferta: deleteField(), updatedAt: timestamp });
        if (productos[productIndex].exists() && (productos[productIndex].data() as Producto).estadoPublicacion !== 'pendiente') {
          batch.set(doc(this.db, `productosPublicos/${id}`), { precioOferta: deleteField(), updatedAt: timestamp }, { merge: true });
        }
      }
      await batch.commit();
    }
  }
}
