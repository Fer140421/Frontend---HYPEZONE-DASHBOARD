import { AuditableEntity } from './base.model';
import { MetodoPago } from './venta.model';

export type EstadoReserva = 'activa' | 'confirmada' | 'cancelada' | 'vencida';

export interface ReservaDetalle {
  productoId: string;
  nombreProducto: string;
  precioAcordado: number;
}

export interface ReservaPago {
  id?: string;
  monto: number;
  metodoPago: MetodoPago;
  fecha: string;
  cajaId?: string;
  notas?: string;
}

export interface Reserva extends AuditableEntity {
  schemaVersion?: number;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteCi?: string;
  detalles: ReservaDetalle[];
  total: number;
  anticipos: ReservaPago[];
  /** Total de anticipos ya aplicados a prendas convertidas en ventas. */
  anticiposAplicados?: number;
  saldoPendiente: number;
  estado: EstadoReserva;
  fechaReserva: string;
  fechaVencimiento?: string;
  notas?: string;
  ventaOperacionId?: string;
  cotizacionId?: string;
  fechaCierre?: string;
}

export const estadosReserva: EstadoReserva[] = ['activa', 'confirmada', 'cancelada', 'vencida'];

export function totalAnticipos(reserva: Pick<Reserva, 'anticipos'>): number {
  return (reserva.anticipos ?? []).reduce((total, pago) => total + Number(pago.monto ?? 0), 0);
}

export function totalAnticiposDisponibles(reserva: Pick<Reserva, 'anticipos' | 'anticiposAplicados'>): number {
  return Math.max(0, totalAnticipos(reserva) - Number(reserva.anticiposAplicados ?? 0));
}
