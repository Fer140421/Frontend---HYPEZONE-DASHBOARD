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
  totalCostoPrendas?: number;
  totalGanancia?: number;
  totalGastosEfectivo?: number;
  totalGastos?: number;
  totalEsperadoEfectivo?: number;
  totalEsperadoGeneral?: number;
  capitalMasInversion?: number;
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
  totalCostoPrendas: number;
  totalGanancia: number;
  totalGastosEfectivo: number;
  totalGastos: number;
  totalEsperadoEfectivo: number;
  totalEsperadoGeneral: number;
  capitalMasInversion: number;
  cantidadVentas: number;
  cantidadGastos: number;
}
