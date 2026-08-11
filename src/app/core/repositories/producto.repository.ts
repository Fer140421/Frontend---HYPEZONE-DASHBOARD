import { Injectable } from '@angular/core';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
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
  if (item.color !== undefined) publicData['color'] = item.color;
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
    const id = await super.create(item);
    try {
      const publicPayload = removeUndefinedDeep({
        ...sanitizePublicProduct(item),
        activo: item.activo ?? true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(this.firestore, `productosPublicos/${id}`), publicPayload);
    } catch (err) {
      console.warn('No se pudo crear el espejo en productosPublicos:', err);
    }
    return id;
  }

  override async update(id: string, item: Partial<Producto>): Promise<void> {
    await super.update(id, item);
    try {
      const publicPayload = removeUndefinedDeep({
        ...sanitizePublicProduct(item),
        updatedAt: serverTimestamp(),
      });
      if (Object.keys(publicPayload).length > 0) {
        await setDoc(doc(this.firestore, `productosPublicos/${id}`), publicPayload, { merge: true });
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
}
