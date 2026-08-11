# Dominio de lotes de Hypezone

## Fuentes de verdad

| Dato | Fuente |
|---|---|
| Productos asociados | Productos activos cuyo `loteId` coincide con el ID del lote |
| Cantidad de productos | Conteo dinámico de esos productos; nunca `lote.cantidadProductos` |
| Disponibles y reservados | Estado de los productos activos asociados |
| Productos vendidos | Ventas activas cuyo `loteId` coincide con el lote; si una venta histórica no tiene `loteId`, se resuelve mediante el `loteId` actual de su producto |
| Inversión asignada | Suma de `producto.precioCompra` de productos activos asociados |
| Valor esperado | Suma de `producto.precioVenta` de productos activos asociados |
| Ingreso real | Suma de `venta.precioVenta` de ventas activas del lote |
| Ganancia real | Suma de `venta.ganancia` de ventas activas del lote |
| Recuperación | `(ingresoReal / costoTotal) * 100`, o cero cuando `costoTotal` es cero |

| Lotes activos (Resumen) | Conteo de lotes cuyo `activo !== false` que poseen al menos un producto activo con `estado === 'disponible'` |

`cantidadProductos` permanece en documentos antiguos y se inicializa en cero en lotes nuevos por
compatibilidad. No es editable ni participa en cálculos. Las métricas no se persisten en Firestore;
`LoteAnalyticsService` las calcula con funciones puras a partir de lotes, productos y ventas.

## Relación lote, producto y venta

Un producto pertenece a un lote mediante `producto.loteId`. Una venta conserva el `loteId` que tenía
el producto cuando se vendió como parte de su snapshot histórico. Desvincular posteriormente el
producto no modifica la venta. Como compatibilidad para ventas antiguas sin `loteId`, las métricas
usan el `loteId` actual del producto solo cuando la venta no tiene ese snapshot; si la venta ya tiene
`loteId`, ese valor tiene prioridad.

## Asociación y desvinculación

- Solo se asocian lotes y productos existentes y activos.
- La pantalla ofrece productos activos sin lote.
- Un producto que pertenece a otro lote se rechaza con un mensaje explícito.
- Si un producto vendido con ventas históricas se intenta mover entre lotes, se exige confirmación
  explícita. La operación no modifica el `loteId` de ventas anteriores.
- Desvincular usa `deleteField()` sobre `producto.loteId`; nunca escribe `null` o `undefined` y nunca
  borra el producto.
- Crear un producto desde el detalle abre el formulario con el lote ya seleccionado.

## Política de desactivación

Los lotes se eliminan operativamente mediante baja lógica. La UI ofrece:

1. Cancelar.
2. Desactivar el lote y conservar sus productos vinculados.
3. Desactivar el lote y desvincular todos sus productos activos.

La tercera opción usa un único `writeBatch`: actualiza `lote.activo`, elimina `loteId` de cada producto
activo y actualiza timestamps. Firestore limita el batch a 500 operaciones; la herramienta rechaza
la operación si serían más de 499 escrituras incluyendo el lote. Ninguna opción borra o modifica
ventas históricas. `hardDelete()` no se expone en la UI y no debe utilizarse cuando haya referencias.

Restaurar solo activa nuevamente el lote. Los productos desvinculados no se reasignan automáticamente.

## Fechas

Los lotes nuevos y editados guardan `fechaCompra` como `Timestamp`. `loteFechaCompra()` acepta también
`Date` y strings ISO antiguos para mantener compatibilidad con documentos existentes y MatDatepicker.

## Ejemplo

Un lote cuesta Bs 1.000. Tiene tres productos activos con compras de Bs 200, 250 y 300, y precios de
venta de Bs 350, 400 y 500. Dos ventas activas registran Bs 350/Bs 150 de ganancia y Bs 400/Bs 150.

- Inversión asignada: Bs 750.
- Valor esperado: Bs 1.250.
- Ingreso real: Bs 750.
- Ganancia real: Bs 300.
- Recuperación del costo declarado: 75%.
- Diferencia entre costo declarado e inversión asignada: Bs 250, por lo que se muestra una alerta.

## Limitaciones actuales

- La combinación se hace en memoria y está pensada para el volumen actual. La pantalla abre como
  máximo un listener por cada colección: lotes, productos y ventas.
- No se crean índices ni se cambian reglas de Firestore en esta fase.
- Las ventas sin `loteId` se resuelven por `productoId` y el lote actual del producto; si el producto
  tampoco existe o no tiene lote, no pueden asignarse automáticamente.
- Un precio de compra ausente o no numérico aporta cero; la vista destaca precios de compra en cero.
- `precio` e `imagen` se conservan por compatibilidad con el esquema anterior.

## Proteccion de productos

Los productos `disponibles` pueden ocultarse mediante baja logica. Los productos `reservados` y
`vendidos` no se eliminan, porque sus referencias deben conservarse para evitar inconsistencias en
reservas, lotes y ventas historicas. Un producto inactivo conserva sus referencias y puede restaurarse
sin modificar su estado ni sus ventas.
