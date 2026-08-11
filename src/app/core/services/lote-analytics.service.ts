import { Injectable } from '@angular/core';
import { Lote } from '../models/lote.model';
import { LoteResumen } from '../models/lote-resumen.model';
import { Producto } from '../models/producto.model';
import { Venta } from '../models/venta.model';

@Injectable({ providedIn: 'root' })
export class LoteAnalyticsService {
  getResumenLote(lote: Lote, productos: Producto[], ventas: Venta[]): LoteResumen {
    const productosLote = productos.filter(
      (producto) => producto.activo !== false && producto.loteId === lote.id,
    );
    const ventasLote = ventas.filter(
      (venta) => venta.activo !== false && venta.loteId === lote.id,
    );
    const costoTotal = this.number(lote.costoTotal);
    const ingresoReal = this.sum(ventasLote, (venta) => venta.precioVenta);

    const cantidadDisponibles = productosLote.filter((p) => p.estado === 'disponible').length;
    const cantidadReservados = productosLote.filter((p) => p.estado === 'reservado').length;
    const cantidadVendidos = ventasLote.length;

    let estadoOperativo: 'activo' | 'inactivo' | 'sin_productos' = 'activo';
    let estadoColor: 'verde' | 'amarillo' | 'rojo' = 'verde';

    if (lote.activo === false || (cantidadDisponibles === 0 && productosLote.length > 0)) {
      estadoOperativo = 'inactivo';
      estadoColor = 'rojo';
    } else if (productosLote.length === 0) {
      estadoOperativo = 'sin_productos';
      estadoColor = 'verde';
    } else {
      // Si se ha vendido más de la mitad (50%) de los productos -> AMARILLO, de lo contrario VERDE
      const porcentajeVendido = (cantidadVendidos / productosLote.length) * 100;
      if (porcentajeVendido > 50) {
        estadoColor = 'amarillo';
      } else {
        estadoColor = 'verde';
      }
    }

    return {
      lote,
      cantidadProductos: productosLote.length,
      cantidadDisponibles,
      cantidadReservados,
      cantidadVendidos,
      inversionAsignada: this.sum(productosLote, (producto) => producto.precioCompra),
      valorEsperado: this.sum(
        productosLote,
        (producto) => producto.precioVenta ?? 0,
      ),
      ingresoReal,
      gananciaReal: this.sum(ventasLote, (venta) => venta.ganancia),
      recuperacionInversion: costoTotal > 0 ? (ingresoReal / costoTotal) * 100 : 0,
      estadoOperativo,
      estadoColor,
    };
  }

  getResumenesLotes(lotes: Lote[], productos: Producto[], ventas: Venta[]): LoteResumen[] {
    return lotes.map((lote) => this.getResumenLote(lote, productos, ventas));
  }

  private sum<T>(items: T[], selector: (item: T) => unknown): number {
    return items.reduce((total, item) => total + this.number(selector(item)), 0);
  }

  private number(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
