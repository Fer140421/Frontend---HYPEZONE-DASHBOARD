import { AuditableEntity } from './base.model';

export type CategoriaGasto =
  | 'transporte'
  | 'empaque'
  | 'alimentacion'
  | 'alquiler'
  | 'servicios'
  | 'marketing'
  | 'equipamiento'
  | 'otro';

export type MetodoPagoGasto = 'caja_efectivo' | 'cuenta_banco' | 'qr' | 'otro';

export interface Gasto extends AuditableEntity {
  concepto: string;
  monto: number;
  categoria: CategoriaGasto;
  metodoPago: MetodoPagoGasto;
  fecha: string;
  cajaId?: string;
  usuarioId: string;
  usuarioNombre: string;
  comprobanteUrl?: string;
  notas?: string;
}

export interface CategoriaGastoItem {
  id: CategoriaGasto;
  label: string;
  icon: string;
}

export const CATEGORIAS_GASTO: CategoriaGastoItem[] = [
  { id: 'transporte', label: 'Transporte / Fletes', icon: 'local_shipping' },
  { id: 'empaque', label: 'Empaque / Bolsas / Insumos', icon: 'inventory_2' },
  { id: 'alimentacion', label: 'Alimentación / Refrigerios', icon: 'restaurant' },
  { id: 'alquiler', label: 'Alquiler de Local / Espacio', icon: 'storefront' },
  { id: 'servicios', label: 'Servicios Básicos / Internet', icon: 'wifi' },
  { id: 'marketing', label: 'Publicidad / Marketing', icon: 'campaign' },
  { id: 'equipamiento', label: 'Equipos / Luces / Mobiliario', icon: 'videocam' },
  { id: 'otro', label: 'Otros Gastos', icon: 'more_horiz' },
];
