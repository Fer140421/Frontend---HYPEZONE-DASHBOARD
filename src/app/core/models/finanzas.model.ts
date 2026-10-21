export interface EstadoFinanciero {
  inversionDisponible: number;
  gananciaAcumulada: number;
  perdidasAcumuladas: number;
  fechaInicioControl?: string;
  historialPerdidasImportado?: boolean;
  updatedAt?: unknown;
}

export interface RegistroPerdida {
  id?: string;
  concepto: string;
  monto: number;
  fecha: string;
  tipo: 'historica_manual';
  notas?: string;
  usuarioId?: string;
  usuarioNombre?: string;
  activo?: boolean;
}

export const ESTADO_FINANCIERO_INICIAL: EstadoFinanciero = {
  inversionDisponible: 867,
  gananciaAcumulada: 544,
  perdidasAcumuladas: 0,
  fechaInicioControl: new Date().toISOString(),
  historialPerdidasImportado: false,
};
