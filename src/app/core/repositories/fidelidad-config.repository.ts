import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { CONFIGURACION_FIDELIDAD_DEFAULT, ConfiguracionFidelidad } from '../models/fidelidad.model';

@Injectable({ providedIn: 'root' })
export class FidelidadConfigRepository {
  private readonly firestore = inject(Firestore);
  private readonly ref = doc(this.firestore, 'configuracion/fidelidad');

  get(): Observable<ConfiguracionFidelidad> {
    return docData(this.ref).pipe(
      map((data) => ({ ...CONFIGURACION_FIDELIDAD_DEFAULT, ...(data as Partial<ConfiguracionFidelidad> | undefined) })),
    );
  }

  save(configuracion: ConfiguracionFidelidad): Promise<void> {
    return setDoc(this.ref, configuracion, { merge: true });
  }
}
