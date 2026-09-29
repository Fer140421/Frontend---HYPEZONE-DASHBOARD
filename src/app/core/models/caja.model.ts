import { AuditableEntity } from './base.model';

export type EstadoCaja = 'abierta' | 'cerrada';

export interface Caja extends AuditableEntity {
  usuarioId: string;
  usuarioNombre: string;
  usuarioEmail?: string;
  montoInicial: number;
  fechaApertura: string;
  estado: EstadoCaja;
  notasApertura?: string;

  // Cierre de caja
  fechaCierre?: string;
  montoFinalReal?: number;
  totalVentasEfectivo?: number;
  totalVentasQR?: number;
  totalVentas?: number;
  totalGastosEfectivo?: number;
  totalEsperadoEfectivo?: number;
  diferencia?: number;
  usuarioCierreId?: string;
  usuarioCierreNombre?: string;
  notasCierre?: string;
}

export interface CierreCajaCalculo {
  montoInicial: number;
  totalVentasEfectivo: number;
  totalVentasQR: number;
  totalVentas: number;
  totalGastosEfectivo: number;
  totalEsperadoEfectivo: number;
  cantidadVentas: number;
  cantidadGastos: number;
}
