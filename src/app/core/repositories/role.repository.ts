import { Injectable } from '@angular/core';
import { Role } from '../models/role.model';
import { FirestoreRepository } from './firestore.repository';

@Injectable({ providedIn: 'root' })
export class RoleRepository extends FirestoreRepository<Role> {
  constructor() { super('roles'); }
}
