import { AuditableEntity } from './base.model';

export interface Categoria extends AuditableEntity {
  nombre: string;
}

export interface Marca extends AuditableEntity {
  nombre: string;
  imagenUrl?: string;
  imagen?: string;
  imagenes?: string[];
}

export function marcaImagen(marca?: Marca | null): string | undefined {
  if (!marca) return undefined;
  return marca.imagenUrl || marca.imagen || (Array.isArray(marca.imagenes) && marca.imagenes.length > 0 ? marca.imagenes[0] : undefined);
}

export interface Talla extends AuditableEntity {
  nombre: string;
}

export const categoriasIniciales = [
  'zapatillas', 'polera', 'chompa', 'canguro', 'pantalon', 'camisa', 'short', 'accesorio', 'otro',
];

export const marcasIniciales = [
  'Adidas', 'Nike', 'Puma', 'Reebok', 'Jordan', 'New Balance', 'Converse', 'Vans',
  'Under Armour', 'The North Face', 'Champion', 'Levi\'s', 'Tommy Hilfiger', 'Calvin Klein',
  'Lacoste', 'Gucci', 'Zara', 'H&M', 'Shein', 'Sin marca',
];

export const tallasIniciales = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44',
];
