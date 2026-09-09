import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Lote } from '../models/lote.model';
import { Producto } from '../models/producto.model';

export type LoteDeactivationMode = 'preserve' | 'unlink';
export type LoteDomainErrorCode = 'CONFIRMAR_REASIGNACION_VENDIDO';

export class LoteDomainError extends Error {
  constructor(readonly code: LoteDomainErrorCode, message: string) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class LoteManagementService {
  private readonly firestore = inject(Firestore);

  async associateProduct(loteId: string, productoId: string, confirmHistoricalMove = false): Promise<void> {
    const ventas = await getDocs(
      query(collection(this.firestore, 'ventas'), where('productoId', '==', productoId)),
    );
    const hasHistoricalSales = !ventas.empty;
    const loteRef = doc(this.firestore, `lotes/${loteId}`);
    const productoRef = doc(this.firestore, `productos/${productoId}`);

    await runTransaction(this.firestore, async (transaction) => {
      const [loteSnapshot, productoSnapshot] = await Promise.all([
        transaction.get(loteRef),
        transaction.get(productoRef),
      ]);
      if (!loteSnapshot.exists()) throw new Error('El lote no existe.');
      const lote = loteSnapshot.data() as Lote;
      if (lote.activo === false) throw new Error('El lote está inactivo.');
      if (!productoSnapshot.exists()) throw new Error('El producto no existe.');
      const producto = productoSnapshot.data() as Producto;
      if (producto.activo === false) throw new Error('El producto está inactivo.');

      if (producto.loteId && producto.loteId !== loteId) {
        if (producto.estado === 'vendido' && hasHistoricalSales) {
          if (!confirmHistoricalMove) {
            throw new LoteDomainError(
              'CONFIRMAR_REASIGNACION_VENDIDO',
              'El producto vendido tiene ventas históricas y ya pertenece a otro lote.',
            );
          }
        } else {
          throw new Error('El producto ya pertenece a otro lote.');
        }
      }

      transaction.update(productoRef, { loteId, updatedAt: serverTimestamp() });
    });
  }

  async unlinkProduct(loteId: string, productoId: string): Promise<void> {
    const productoRef = doc(this.firestore, `productos/${productoId}`);
    await runTransaction(this.firestore, async (transaction) => {
      const productoSnapshot = await transaction.get(productoRef);
      if (!productoSnapshot.exists()) throw new Error('El producto no existe.');
      const producto = productoSnapshot.data() as Producto;
      if (producto.loteId !== loteId) throw new Error('El producto no pertenece a este lote.');
      transaction.update(productoRef, { loteId: deleteField(), updatedAt: serverTimestamp() });
    });
  }

  async deactivateLote(loteId: string, mode: LoteDeactivationMode): Promise<number> {
    const loteRef = doc(this.firestore, `lotes/${loteId}`);
    const [loteSnapshot, productosSnapshot] = await Promise.all([
      getDoc(loteRef),
      getDocs(query(collection(this.firestore, 'productos'), where('loteId', '==', loteId))),
    ]);
    if (!loteSnapshot.exists()) throw new Error('El lote no existe.');

    const productosActivos = productosSnapshot.docs.filter(
      (item) => (item.data() as Producto).activo !== false,
    );
    if (mode === 'unlink' && productosActivos.length > 498) {
      throw new Error('El lote tiene demasiados productos para desvincularlos en una sola operación segura.');
    }

    const batch = writeBatch(this.firestore);
    const timestamp = serverTimestamp();
    batch.update(loteRef, { activo: false, updatedAt: timestamp });
    if (mode === 'unlink') {
      for (const producto of productosActivos) {
        batch.update(producto.ref, { loteId: deleteField(), updatedAt: timestamp });
      }
    }
    await batch.commit();
    return productosActivos.length;
  }

  async restoreLote(loteId: string): Promise<void> {
    const loteRef = doc(this.firestore, `lotes/${loteId}`);
    await runTransaction(this.firestore, async (transaction) => {
      const loteSnapshot = await transaction.get(loteRef);
      if (!loteSnapshot.exists()) throw new Error('El lote no existe.');
      transaction.update(loteRef, { activo: true, updatedAt: serverTimestamp() });
    });
  }

  async prorratearPreciosAProductos(loteId: string, costoTotal: number): Promise<{ actualizados: number; precioUnitario: number }> {
    const productosSnapshot = await getDocs(
      query(collection(this.firestore, 'productos'), where('loteId', '==', loteId)),
    );
    const productosActivos = productosSnapshot.docs.filter(
      (docItem) => (docItem.data() as Producto).activo !== false,
    );
    if (productosActivos.length === 0) {
      throw new Error('No hay prendas asociadas a este lote para prorratear.');
    }
    const precioUnitario = Math.round((costoTotal / productosActivos.length) * 100) / 100;
    const batch = writeBatch(this.firestore);
    const timestamp = serverTimestamp();
    for (const docItem of productosActivos) {
      batch.update(docItem.ref, { precioCompra: precioUnitario, updatedAt: timestamp });
    }
    await batch.commit();
    return { actualizados: productosActivos.length, precioUnitario };
  }
}
