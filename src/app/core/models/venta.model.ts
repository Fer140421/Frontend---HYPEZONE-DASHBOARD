import { AuditableEntity } from './base.model';

export type MetodoPago = 'efectivo' | 'qr';
export type MetodoPagoHistorico = MetodoPago | 'transferencia' | 'otro';
export type EstadoEntregaVenta = 'pendiente' | 'entregado';

export interface Venta extends AuditableEntity {
  schemaVersion?: number;
  operacionId?: string;
  reservaId?: string;
  cajaId?: string;
  usuarioVentaId?: string;
  usuarioVentaNombre?: string;
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
  estadoEntrega?: EstadoEntregaVenta;
  fechaEntrega?: string;
  metodoPago?: MetodoPagoHistorico;
  fechaVenta: string;
  notas?: string;
  puntosGanados?: number;
  recompensaCanjeada?: boolean;
  descuentoFidelidadPorcentaje?: number;
  productoRecompensaId?: string;
  precioOriginal?: number;
  descuentoAplicado?: number;
  consignado?: boolean;
  consignadorNombre?: string;
  montoPendienteConsignador?: number;
  montoLiquidadoConsignador?: number;
  /** Nombre de marca al momento de vender; conserva la clasificación histórica. */
  marcaProducto?: string;
  codigoProducto?: string;
  categoriaProducto?: string;
}

export const metodosPago: MetodoPago[] = ['efectivo', 'qr'];
