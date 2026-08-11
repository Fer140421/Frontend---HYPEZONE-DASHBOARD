import { Lote } from './lote.model';

export interface LoteResumen {
  lote: Lote;
  cantidadProductos: number;
  cantidadDisponibles: number;
  cantidadReservados: number;
  cantidadVendidos: number;
  inversionAsignada: number;
  valorEsperado: number;
  ingresoReal: number;
  gananciaReal: number;
  recuperacionInversion: number;
  estadoOperativo: 'activo' | 'inactivo' | 'sin_productos';
  estadoColor: 'verde' | 'amarillo' | 'rojo';
}
