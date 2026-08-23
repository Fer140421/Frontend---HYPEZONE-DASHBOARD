export interface ConfiguracionFidelidad {
  puntosPorPrenda: number;
  puntosParaRecompensa: number;
  descuentoRecompensaPorcentaje: number;
}

export const CONFIGURACION_FIDELIDAD_DEFAULT: ConfiguracionFidelidad = {
  puntosPorPrenda: 10,
  puntosParaRecompensa: 100,
  descuentoRecompensaPorcentaje: 40,
};
