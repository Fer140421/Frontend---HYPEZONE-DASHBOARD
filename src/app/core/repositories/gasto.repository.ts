import { Injectable } from '@angular/core';
import { collection, collectionData, query, where } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Gasto } from '../models/gasto.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class GastoRepository extends FirestoreRepository<Gasto> {
  constructor() {
    super('gastos');
  }

  getGastosPorCaja(cajaId: string): Observable<Gasto[]> {
    const ref = collection(this.firestore, this.collectionName);
    const q = query(ref, where('cajaId', '==', cajaId));
    return collectionData(q, { idField: 'id' }) as Observable<Gasto[]>;
  }
}
