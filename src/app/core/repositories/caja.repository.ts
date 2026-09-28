import { Injectable } from '@angular/core';
import { collection, collectionData, query, where } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Caja } from '../models/caja.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class CajaRepository extends FirestoreRepository<Caja> {
  constructor() {
    super('cajas');
  }

  getCajaAbiertaPorUsuario(usuarioId: string): Observable<Caja | null> {
    const ref = collection(this.firestore, this.collectionName);
    const q = query(
      ref,
      where('usuarioId', '==', usuarioId),
      where('estado', '==', 'abierta'),
    );

    return (collectionData(q, { idField: 'id' }) as Observable<Caja[]>).pipe(
      map((cajas) => {
        const activas = cajas.filter((c) => c.activo !== false);
        return activas.length > 0 ? activas[0] : null;
      }),
    );
  }
}
