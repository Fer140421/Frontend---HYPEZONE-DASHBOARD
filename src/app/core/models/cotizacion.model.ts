import { AuditableEntity } from './base.model';

export type EstadoCotizacion = 'vigente' | 'convertida' | 'cancelada';

export interface CotizacionDetalle {
  productoId: string;
  nombreProducto: string;
  codigo?: string;
  imagen?: string;
  /** Snapshot of internal purchase cost when the quote was created. */
  precioCompra?: number;
  /** Snapshot of regular sale price for comparison with the quoted price. */
  precioVenta?: number;
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
