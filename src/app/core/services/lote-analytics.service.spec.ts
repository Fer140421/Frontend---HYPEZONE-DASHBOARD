import { Lote } from '../models/lote.model';
import { Producto } from '../models/producto.model';
import { Venta } from '../models/venta.model';
import { LoteAnalyticsService } from './lote-analytics.service';

describe('LoteAnalyticsService', () => {
  const service = new LoteAnalyticsService();
  const lote = (overrides: Partial<Lote> = {}): Lote => ({
    id: 'l1', nombre: 'Lote 1', fechaCompra: '2026-01-01', costoTotal: 100,
    cantidadProductos: 99, ...overrides,
  });
  const producto = (overrides: Partial<Producto> = {}): Producto => ({
    id: 'p1', loteId: 'l1', nombre: 'Producto', descripcion: '', talla: 'M',
    estado: 'disponible', precioCompra: 20, precioVenta: 40, imagenes: [], activo: true, ...overrides,
  });
  const venta = (overrides: Partial<Venta> = {}): Venta => ({
    id: 'v1', productoId: 'p1', loteId: 'l1', nombreProducto: 'Producto', precioCompra: 20,
    precioVenta: 40, ganancia: 20, fechaVenta: '2026-01-02', activo: true, ...overrides,
  });

  it('devuelve ceros para un lote sin productos ni ventas', () => {
    const result = service.getResumenLote(lote(), [], []);
    expect(result.cantidadProductos).toBe(0);
    expect(result.inversionAsignada).toBe(0);
    expect(result.ingresoReal).toBe(0);
  });

  it('cuenta productos disponibles y vendidos desde sus fuentes correctas', () => {
    const result = service.getResumenLote(
      lote(), [producto(), producto({ id: 'p2', estado: 'vendido' })], [venta()],
    );
    expect(result.cantidadProductos).toBe(2);
    expect(result.cantidadDisponibles).toBe(1);
    expect(result.cantidadVendidos).toBe(1);
    expect(result.valorEsperado).toBe(80);
  });

  it('ignora productos inactivos', () => {
    expect(service.getResumenLote(lote(), [producto({ activo: false })], []).cantidadProductos).toBe(0);
  });

  it('ignora ventas inactivas', () => {
    expect(service.getResumenLote(lote(), [], [venta({ activo: false })]).ingresoReal).toBe(0);
  });

  it('devuelve recuperacion cero cuando costoTotal es cero', () => {
    expect(service.getResumenLote(lote({ costoTotal: 0 }), [], [venta()]).recuperacionInversion).toBe(0);
  });

  it('tolera productos sin precioCompra', () => {
    expect(service.getResumenLote(lote(), [producto({ precioCompra: undefined })], []).inversionAsignada).toBe(0);
  });

  it('calcula ventas parciales sin depender del estado de todos los productos', () => {
    const result = service.getResumenLote(lote(), [producto(), producto({ id: 'p2' })], [venta()]);
    expect(result.ingresoReal).toBe(40);
    expect(result.cantidadVendidos).toBe(1);
  });

  it('incluye ventas antiguas sin loteId usando el lote actual del producto', () => {
    const result = service.getResumenLote(
      lote(),
      [producto({ estado: 'vendido' })],
      [venta({ loteId: undefined })],
    );

    expect(result.cantidadVendidos).toBe(1);
    expect(result.ingresoReal).toBe(40);
    expect(result.gananciaReal).toBe(20);
  });

  it('no reasigna una venta antigua si el producto pertenece a otro lote', () => {
    const result = service.getResumenLote(
      lote(),
      [producto({ loteId: 'l2', estado: 'vendido' })],
      [venta({ loteId: undefined })],
    );

    expect(result.cantidadVendidos).toBe(0);
    expect(result.ingresoReal).toBe(0);
  });

  it('calcula porcentaje de recuperacion', () => {
    expect(service.getResumenLote(lote({ costoTotal: 80 }), [], [venta()]).recuperacionInversion).toBe(50);
  });

  it('calcula ganancia real desde ventas activas', () => {
    const result = service.getResumenLote(lote(), [], [venta(), venta({ id: 'v2', ganancia: 5 })]);
    expect(result.gananciaReal).toBe(25);
  });
});
