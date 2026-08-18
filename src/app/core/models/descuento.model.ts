import { AuditableEntity } from './base.model';

export type TipoDescuento = 'porcentaje' | 'precio';

export interface Descuento extends AuditableEntity {
  nombre: string;
  tipo: TipoDescuento;
  valor: number;
  activo: boolean;
}
