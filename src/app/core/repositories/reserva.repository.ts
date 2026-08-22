import { Injectable } from '@angular/core';
import { Reserva } from '../models/reserva.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class ReservaRepository extends FirestoreRepository<Reserva> {
  constructor() {
    super('reservas');
  }
}
