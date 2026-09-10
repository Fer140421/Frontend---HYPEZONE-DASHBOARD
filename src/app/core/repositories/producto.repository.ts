import { Injectable } from '@angular/core';
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Producto, normalizeProducto } from '../models/producto.model';
import { FirestoreRepository, removeUndefinedDeep } from './firestore.repository';

export function sanitizePublicProduct(item: Partial<Producto>): Record<string, unknown> {
  const publicData: Record<string, unknown> = {};

  if (item.nombre !== undefined) publicData['nombre'] = item.nombre;
  if (item.marca !== undefined) publicData['marca'] = item.marca;
  if (item.categoria !== undefined) publicData['categoria'] = item.categoria;
  if (item.descripcion !== undefined) publicData['descripcion'] = item.descripcion;
  if (item.talla !== undefined) publicData['talla'] = item.talla;
  if (item.genero !== undefined) publicData['genero'] = item.genero;
  if (item.precioVenta !== undefined) publicData['precioVenta'] = item.precioVenta;
  if (item.precioOferta !== undefined) publicData['precioOferta'] = item.precioOferta;
  if (item.estado !== undefined) publicData['estado'] = item.estado;
  if (item.imagenes !== undefined) publicData['imagenes'] = item.imagenes;
  if (item.codigo !== undefined) publicData['codigo'] = item.codigo;
  if (item.activo !== undefined) publicData['activo'] = item.activo;

  return publicData;
}

@Injectable({ providedIn: 'root' })
export class ProductoRepository extends FirestoreRepository<Producto> {
  constructor() {
    super('productos');
  }

  override getAll(includeInactive = false): Observable<Producto[]> {
    return super
      .getAll(includeInactive)
      .pipe(map((productos) => productos.map((producto) => normalizeProducto(producto))));
  }

  override getById(id: string): Observable<Producto | undefined> {
    return super.getById(id).pipe(map((producto) => (producto ? normalizeProducto(producto) : producto)));
  }

  getByLote(loteId: string): Observable<Producto[]> {
    return this.getAll().pipe(map((productos) => productos.filter((producto) => producto.loteId === loteId)));
  }

  getDisponibles(): Observable<Producto[]> {
    return this.getAll().pipe(map((productos) => productos.filter((p) => p.estado === 'disponible')));
  }

  override async create(item: Partial<Producto>): Promise<string> {
    return super.create({
      ...this.normalizeOfferForCreate(item),
      estadoPublicacion: item.estadoPublicacion ?? 'pendiente',
    });
  }

  override async update(id: string, item: Partial<Producto>): Promise<void> {
    const includesOffer = Object.hasOwn(item, 'precioOferta');
    const { precioOferta, ...otherFields } = item;
    const validOffer = this.validOffer(precioOferta);
    const normalizedItem = includesOffer
      ? { ...otherFields, precioOferta: validOffer ?? deleteField() }
      : item;

    await super.update(id, normalizedItem as Partial<Producto>);
    try {
      const publicPayload = removeUndefinedDeep({
        ...sanitizePublicProduct(otherFields),
        ...(includesOffer ? { precioOferta: validOffer ?? deleteField() } : {}),
        updatedAt: serverTimestamp(),
      });
      const publicRef = doc(this.firestore, `productosPublicos/${id}`);
      if (Object.keys(publicPayload).length > 0 && (await getDoc(publicRef)).exists()) {
        await setDoc(publicRef, publicPayload, { merge: true });
      }
    } catch (err) {
      console.warn('No se pudo actualizar el espejo en productosPublicos:', err);
    }
  }

  override async delete(id: string): Promise<void> {
    const snapshot = await getDoc(doc(this.firestore, `productos/${id}`));
    if (!snapshot.exists()) {
      throw new Error('El producto no existe.');
    }

    const producto = snapshot.data() as Producto;
    if (producto.activo === false) {
      throw new Error('El producto ya esta inactivo.');
    }

    if (producto.estado !== 'disponible') {
      throw new Error('Los productos vendidos o reservados no se pueden eliminar.');
    }

    await super.delete(id);
  }

  override async hardDelete(id: string): Promise<void> {
    await super.hardDelete(id);
    try {
      await deleteDoc(doc(this.firestore, `productosPublicos/${id}`));
    } catch (err) {
      console.warn('No se pudo eliminar el espejo en productosPublicos:', err);
    }
  }

  cambiarEstado(id: string, estado: Producto['estado']): Promise<void> {
    return this.update(id, { estado });
  }

  cambiarPrecio(id: string, precioVenta: number): Promise<void> {
    return this.update(id, { precioVenta });
  }

  async publicarEnWeb(id: string): Promise<void> {
    const productRef = doc(this.firestore, `productos/${id}`);
    const snapshot = await getDoc(productRef);
    if (!snapshot.exists()) throw new Error('El producto no existe.');

    const producto = normalizeProducto({ id: snapshot.id, ...(snapshot.data() as Producto) });
    const faltantes = this.datosFaltantesParaPublicar(producto);
    if (faltantes.length) {
      throw new Error(`Completa lo siguiente antes de publicar: ${faltantes.join(', ')}.`);
    }

    const timestamp = serverTimestamp();
    await setDoc(
      doc(this.firestore, `productosPublicos/${id}`),
      removeUndefinedDeep({
        ...sanitizePublicProduct(producto),
        productoId: id,
        activo: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      { merge: true },
    );
    await super.update(id, { estadoPublicacion: 'publicado' });
  }

  /**
   * Publica de forma atómica por grupos los productos indicados. Antes de escribir,
   * valida todos los pendientes para no dejar un lote publicado parcialmente.
   */
  async publicarProductosEnWeb(ids: string[]): Promise<number> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return 0;

    const snapshots = await Promise.all(
      uniqueIds.map((id) => getDoc(doc(this.firestore, `productos/${id}`))),
    );
    const productos = snapshots.map((snapshot, index) => {
      if (!snapshot.exists()) {
        throw new Error(`El producto con ID ${uniqueIds[index]} ya no existe.`);
      }
      return normalizeProducto({ id: snapshot.id, ...(snapshot.data() as Producto) });
    });
    const pendientes = productos.filter((producto) => producto.estadoPublicacion !== 'publicado');
    const invalidos = pendientes
      .map((producto) => ({ producto, faltantes: this.datosFaltantesParaPublicar(producto) }))
      .filter(({ faltantes }) => faltantes.length);

    if (invalidos.length) {
      const detalle = invalidos
        .map(({ producto, faltantes }) => `${producto.nombre}: ${faltantes.join(', ')}`)
        .join(' | ');
      throw new Error(`No se publicó el lote. Corrige: ${detalle}.`);
    }

    for (let index = 0; index < pendientes.length; index += 250) {
      const batch = writeBatch(this.firestore);
      const timestamp = serverTimestamp();

      for (const producto of pendientes.slice(index, index + 250)) {
        const id = producto.id!;
        batch.set(
          doc(this.firestore, `productosPublicos/${id}`),
          removeUndefinedDeep({
            ...sanitizePublicProduct(producto),
            productoId: id,
            activo: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          { merge: true },
        );
        batch.update(doc(this.firestore, `productos/${id}`), {
          estadoPublicacion: 'publicado',
          updatedAt: timestamp,
        });
      }

      await batch.commit();
    }

    return pendientes.length;
  }

  /** Reasigna una categoría y mantiene sincronizado el producto publicado, si existe. */
  async reasignarCategoria(ids: string[], categoria: string): Promise<void> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return;

    for (let index = 0; index < uniqueIds.length; index += 250) {
      const group = uniqueIds.slice(index, index + 250);
      const productRefs = group.map((id) => doc(this.firestore, `productos/${id}`));
      const publicRefs = group.map((id) => doc(this.firestore, `productosPublicos/${id}`));
      const [products, publicProducts] = await Promise.all([
        Promise.all(productRefs.map((ref) => getDoc(ref))),
        Promise.all(publicRefs.map((ref) => getDoc(ref))),
      ]);
      const batch = writeBatch(this.firestore);
      const timestamp = serverTimestamp();

      for (let productIndex = 0; productIndex < group.length; productIndex++) {
        if (!products[productIndex].exists()) continue;
        batch.update(productRefs[productIndex], { categoria, updatedAt: timestamp });
        if (publicProducts[productIndex].exists()) {
          batch.update(publicRefs[productIndex], { categoria, updatedAt: timestamp });
        }
      }

      await batch.commit();
    }
  }

  /**
   * Actualiza la oferta de varios productos junto con su espejo público. Cada producto
   * representa dos escrituras, por eso se divide en lotes compatibles con Firestore.
   */
  async actualizarOfertas(ids: string[], precioOferta: number | null): Promise<void> {
    await this.actualizarOfertasIndividuales(
      [...new Set(ids.filter(Boolean))].map((id) => ({ id, precioOferta })),
    );
  }

  async actualizarOfertasIndividuales(ofertas: Array<{ id: string; precioOferta: number | null }>): Promise<void> {
    const uniqueOffers = [...new Map(ofertas.filter((item) => item.id).map((item) => [item.id, item])).values()];

    for (let index = 0; index < uniqueOffers.length; index += 250) {
      const batch = writeBatch(this.firestore);
      const timestamp = serverTimestamp();
      const group = uniqueOffers.slice(index, index + 250);
      const products = await Promise.all(group.map((offer) => getDoc(doc(this.firestore, `productos/${offer.id}`))));

      for (let productIndex = 0; productIndex < group.length; productIndex++) {
        const offer = group[productIndex];
        const value = offer.precioOferta === null ? deleteField() : offer.precioOferta;
        const id = offer.id;
        batch.update(doc(this.firestore, `productos/${id}`), {
          precioOferta: value,
          updatedAt: timestamp,
        });
        if (products[productIndex].exists() && (products[productIndex].data() as Producto).estadoPublicacion !== 'pendiente') {
          batch.set(
            doc(this.firestore, `productosPublicos/${id}`),
            { precioOferta: value, updatedAt: timestamp },
            { merge: true },
          );
        }
      }

      await batch.commit();
    }
  }

  private normalizeOfferForCreate(item: Partial<Producto>): Partial<Producto> {
    if (!Object.hasOwn(item, 'precioOferta')) return item;
    const validOffer = this.validOffer(item.precioOferta);
    if (validOffer !== null) return { ...item, precioOferta: validOffer };
    const { precioOferta: _precioOferta, ...withoutOffer } = item;
    return withoutOffer;
  }

  private validOffer(value: unknown): number | null {
    const offer = Number(value);
    return Number.isFinite(offer) && offer > 0 ? offer : null;
  }

  private datosFaltantesParaPublicar(producto: Producto): string[] {
    const faltantes: string[] = [];
    if (!producto.imagenes.length) faltantes.push('al menos una foto');
    if (!producto.nombre.trim()) faltantes.push('nombre');
    if (!producto.talla.trim()) faltantes.push('talla');
    if (!producto.categoria) faltantes.push('categoría');
    if (!producto.descripcion.trim()) faltantes.push('descripción');
    if (!Number.isFinite(producto.precioVenta) || producto.precioVenta <= 0) faltantes.push('precio de venta válido');
    if (producto.activo === false) faltantes.push('producto activo');
    if (producto.estado !== 'disponible') faltantes.push('estado disponible');
    return faltantes;
  }
}
