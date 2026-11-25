import { AuditableEntity } from './base.model';

export type EstadoCotizacion = 'vigente' | 'convertida' | 'cancelada';

export interface CotizacionDetalle {
  productoId: string;
  nombreProducto: string;
  codigo?: string;
  imagen?: string;
  precioCotizado: number;
}

export interface Cotizacion extends AuditableEntity {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  detalles: CotizacionDetalle[];
  total: number;
  fechaCotizacion: string;
  fechaVencimiento: string;
  estado: EstadoCotizacion;
  notas?: string;
  reservaId?: string;
}
