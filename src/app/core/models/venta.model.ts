import { AuditableEntity } from './base.model';

export type MetodoPago = 'efectivo' | 'qr';
export type MetodoPagoHistorico = MetodoPago | 'transferencia' | 'otro';

export interface Venta extends AuditableEntity {
  schemaVersion?: number;
  operacionId?: string;
  reservaId?: string;
  cantidadDetalles?: number;
  totalOperacion?: number;
  productoId: string;
  loteId?: string;
  nombreProducto: string;
  precioCompra: number;
  precioVenta: number;
  ganancia: number;
  clienteId?: string;
  clienteNombre?: string;
  clienteTelefono?: string;
  clienteCi?: string;
  metodoPago?: MetodoPagoHistorico;
  fechaVenta: string;
  notas?: string;
  puntosGanados?: number;
  recompensaCanjeada?: boolean;
  descuentoFidelidadPorcentaje?: number;
  productoRecompensaId?: string;
  precioOriginal?: number;
  descuentoAplicado?: number;
}

export const metodosPago: MetodoPago[] = ['efectivo', 'qr'];
