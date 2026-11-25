import { Injectable } from '@angular/core';
import { Cotizacion } from '../models/cotizacion.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class CotizacionRepository extends FirestoreRepository<Cotizacion> {
  constructor() {
    super('cotizaciones');
  }
}
