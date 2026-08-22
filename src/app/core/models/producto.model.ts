import { AuditableEntity } from './base.model';

export type CategoriaProducto =
  | 'zapatillas'
  | 'polera'
  | 'chompa'
  | 'canguro'
  | 'pantalon'
  | 'camisa'
  | 'short'
  | 'accesorio'
  | 'otro';

export type GeneroProducto = 'hombre' | 'mujer' | 'unisex' | 'nino' | 'nina';
export type EstadoProducto = 'disponible' | 'reservado' | 'vendido';
export type EstadoPublicacionProducto = 'pendiente' | 'publicado';

export interface Producto extends AuditableEntity {
  schemaVersion?: number;
  loteId?: string;
  nombre: string;
  marca?: string;
  categoria?: CategoriaProducto | string;
  descripcion: string;
  talla: string;
  color?: string;
  genero?: GeneroProducto;
  precioCompra: number;
  precioVenta: number;
  precioOferta?: number;
  /** Campaign that owns the current offer. Only one active campaign is allowed per product. */
  descuentoId?: string;
  estado: EstadoProducto;
  /** Controla si el producto ya fue enviado al catálogo público. */
  estadoPublicacion?: EstadoPublicacionProducto;
  imagenes: string[];
  codigo?: string;
  notas?: string;
}

export function normalizeProducto(producto: Producto): Producto {
  return {
    ...producto,
    imagenes: Array.isArray(producto.imagenes) ? producto.imagenes : [],
    precioVenta: Number(producto.precioVenta ?? 0),
    precioCompra: Number(producto.precioCompra ?? 0),
    activo: producto.activo ?? true,
    estado: producto.estado ?? 'disponible',
    // Los productos anteriores a este cambio ya tienen espejo público.
    estadoPublicacion: producto.estadoPublicacion ?? 'publicado',
  };
}

export function precioProducto(producto: Producto): number {
  return Number(producto.precioVenta ?? 0);
}

export function precioCompraProducto(producto: Producto): number {
  return Number(producto.precioCompra ?? 0);
}

export function imagenesProducto(producto: Producto): string[] {
  return Array.isArray(producto.imagenes) ? producto.imagenes : [];
}

export function normalizeImagenes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return typeof value === 'string' && value ? [value] : [];
}

export const categoriasProducto: CategoriaProducto[] = [
  'zapatillas',
  'polera',
  'chompa',
  'canguro',
  'pantalon',
  'camisa',
  'short',
  'accesorio',
  'otro',
];

export const estadosProducto: EstadoProducto[] = ['disponible', 'reservado', 'vendido'];
export const generosProducto: GeneroProducto[] = ['hombre', 'mujer', 'unisex', 'nino', 'nina'];

export const coloresProducto: string[] = [
  'Negro',
  'Blanco',
  'Gris',
  'Plomo',
  'Rojo',
  'Azul',
  'Azul Marino',
  'Verde',
  'Verde Olivo',
  'Amarillo',
  'Naranja',
  'Rosado',
  'Morado',
  'Beige',
  'Marrón',
  'Celeste',
  'Multicolor',
  'Otro',
];

export function generateProductCode(): string {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `HZ-${randomNum}`;
}
