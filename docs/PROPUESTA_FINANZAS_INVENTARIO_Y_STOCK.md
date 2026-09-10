# Propuesta para finanzas, reinversión, inventario y stock

Fecha: 9 de septiembre de 2026.

Estado: propuesta pendiente de implementación.

Este análisis se basa en el código, los modelos y la documentación de Firestore del repositorio. No se consultaron los datos reales de producción. Guardar esta propuesta no modifica el funcionamiento del sistema.

## 1. Problema que se busca resolver

Reinvertir el dinero de las ventas no debe aumentar el dinero que el propietario aportó al negocio. Lo que aumenta son las compras acumuladas; un aporte inicial de 800 Bs sigue siendo 800 Bs hasta que ingrese dinero adicional del propietario.

El sistema necesita separar tres áreas: **finanzas, compras e inventario**. También debe permitir vender prendas únicas y artículos repetidos por modelo, talla y color.

## 2. Qué ocurre actualmente

En [resumen.component.ts](../src/app/features/dashboard/resumen/resumen.component.ts), `totalInvertido` suma el `precioCompra` de todos los productos activos, incluyendo los vendidos.

Cuando se registra otra compra con dinero recuperado de las ventas, el importe vuelve a sumarse. Ese indicador:

- No representa los aportes personales.
- No representa el valor de la mercadería que todavía queda.
- Tampoco es un historial contable fiable de compras, porque depende de qué productos continúen activos.

Además, «Ganancia real» suma `precioVenta - precioCompra`, pero la pantalla la describe como utilidad neta. Actualmente es un **margen bruto sobre las prendas vendidas**: faltan gastos, pérdidas y otros conceptos para hablar de utilidad neta.

## 3. Ejemplo con los 800 Bs iniciales

Supongamos que se vende toda la mercadería por 1.100 Bs, sin deudas ni impuestos en este ejemplo:

| Operación | Dinero disponible | Mercadería a costo | Aportes del propietario acumulados | Ganancia acumulada |
|---|---:|---:|---:|---:|
| Aporte de 800 Bs | 800 | 0 | 800 | 0 |
| Compra de mercadería por 800 Bs | 0 | 800 | 800 | 0 |
| Venta de todo por 1.100 Bs | 1.100 | 0 | 800 | 300 |
| Nueva compra por 900 Bs | 200 | 900 | 800 | 300 |
| Pago de 50 Bs de gastos del negocio | 150 | 900 | 800 | 250 |

Al terminar:

- El propietario aportó **800 Bs**.
- Las compras acumuladas durante distintos ciclos fueron **1.700 Bs**.
- El negocio tiene **150 Bs en dinero y 900 Bs en mercadería**.
- Su patrimonio es **1.050 Bs**, equivalente a los 800 aportados más 250 de ganancia.

La ganancia no desapareció al reinvertirla: parte quedó convertida en mercadería. Por eso ganancia y dinero disponible necesitan indicadores distintos.

No hace falta obligar al usuario a clasificar cada compra entre «capital original» y «ganancia reinvertida». El sistema debe registrar de qué cuenta salió el pago y reconocer por separado cualquier aporte nuevo.

## 4. Registro financiero para que el dinero cuadre

Cada operación necesita una clasificación con efectos claros:

| Operación | Efecto en dinero | Efecto principal |
|---|---|---|
| Aporte del propietario | Entra dinero | Aumenta el capital aportado; no es venta |
| Compra pagada de mercadería | Sale dinero | Aumenta inventario |
| Venta entregada y cobrada | Entra dinero | Registra venta, costo vendido y salida de stock |
| Gasto del negocio | Sale dinero si se paga | Reduce el resultado |
| Retiro personal | Sale dinero | Reduce patrimonio; no es gasto operativo |
| Préstamo recibido | Entra dinero | Aumenta deuda; no es ganancia |
| Transferencia de caja a banco | Sale de una cuenta y entra en otra | No cambia el dinero total ni la ganancia |
| Anticipo de cliente | Entra dinero | Queda pendiente de aplicar a una venta o devolver |

Comprar mercadería no debe descontarse íntegramente de la ganancia del mes si todavía queda sin vender. Su costo se reconoce al venderla; esa distinción está recogida en [IAS 2 sobre inventarios](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).

Se proponen cuentas como **Caja tienda** y **Banco**. «QR» sería el método de pago, asociado a la cuenta que recibió realmente el dinero.

Cada cuenta tendría:

```text
Saldo esperado = saldo inicial + entradas − salidas
```

Un cierre permitiría comparar ese saldo con el efectivo contado o el extracto bancario. Una diferencia debe quedar registrada con responsable y explicación; no corregirse cambiando el saldo sin historial.

También hay que separar:

- **Compra, recepción y pago:** se puede recibir mercadería hoy y pagar al proveedor después.
- **Venta y cobro:** se puede cobrar un anticipo antes de entregar, o vender dejando saldo pendiente.

El sistema ya contempla anticipos en [reserva.model.ts](../src/app/core/models/reserva.model.ts). Falta integrarlos con un registro central de dinero: al convertir la reserva en venta, no se debe contabilizar el anticipo como un nuevo cobro por segunda vez. La cancelación también necesita resolver explícitamente su devolución o saldo a favor.

## 5. Inventario y stock: conceptos y funcionamiento actual

- **Catálogo:** qué artículos se comercializan, con sus nombres, fotos y características.
- **Stock:** cuántas unidades existen, cuántas están reservadas y cuántas se pueden vender.
- **Control de inventario:** registra esas existencias, su ubicación, costo, entradas, salidas y ajustes.

Actualmente, [Producto](../src/app/core/models/producto.model.ts) representa prácticamente una unidad física. Tiene una talla y un estado: `disponible`, `reservado` o `vendido`. No tiene cantidades por variante.

El stock disponible se obtiene contando productos disponibles. Para registrar seis unidades iguales habría que crear seis productos. Al vender uno, ese registro queda vendido completo.

Esto sirve para prendas únicas o de segunda mano, pero resulta limitado para mercadería repetida. Ya existen categorías de zapatillas y accesorios; lo que falta es modelar sus variantes y cantidades.

## 6. Modelos, tallas, colores y unidades repetidas

Se propone esta estructura:

```text
Producto → Variante → Existencias por ubicación
```

Por ejemplo:

| Producto/modelo | Variante | Stock físico | Reservado | Disponible |
|---|---|---:|---:|---:|
| Zapatilla modelo A | Negro, EU 38 | 3 | 1 | 2 |
| Zapatilla modelo A | Negro, EU 39 | 4 | 0 | 4 |
| Zapatilla modelo A | Blanco, EU 38 | 2 | 0 | 2 |
| Gorra modelo B | Negro, ajustable | 6 | 0 | 6 |

Cada variante tendría su propio SKU o código único. En calzado conviene guardar también el sistema de talla: EU, US, etc.

Los casos se resolverían así:

- **Seis unidades iguales:** una variante con cantidad seis.
- **Un mismo modelo en seis tallas o colores:** varias variantes del mismo producto.
- **Seis modelos diferentes:** seis productos, cada uno con sus variantes.
- **Prenda única:** una unidad identificada individualmente, con su costo, fotos y condición.

Se mantendrían ambos modos: **control por cantidades** y **control por unidad individual**.

El producto general ya no debería quedar «vendido» cuando se vende una unidad. Su disponibilidad se calcula a partir de sus variantes.

Para existencias físicamente presentes:

```text
Disponible = físico − reservado − bloqueado
```

Lo bloqueado puede ser mercadería dañada o en revisión. Las categorías reservado y bloqueado deben evitar contar una misma unidad dos veces. Una reserva reduce lo disponible, pero no lo físico; la entrega sí reduce lo físico.

## 7. Historial de movimientos de stock

No bastaría con agregar un campo `cantidadStock` editable. Se necesita un historial que explique cómo se llegó a esa cantidad:

- Recepción de compra.
- Salida por venta.
- Devolución de cliente.
- Devolución a proveedor.
- Pérdida, daño o robo.
- Ajuste por conteo físico.
- Traslado entre ubicaciones.

Cada movimiento debe guardar variante, cantidad, fecha, responsable, motivo y documento de origen.

**Entrada de stock no siempre significa entrada de dinero.** Una compra pagada produce entrada de mercadería y salida de dinero. Una pérdida produce salida de mercadería sin cobro. Una reserva puede producir entrada de dinero sin salida física todavía.

También conviene separar «ocultar del catálogo» de «dar de baja mercadería»: desactivar una publicación no debe hacer desaparecer el valor del inventario.

## 8. Costos cuando se compra lo mismo a distintos precios

El costo no debería depender únicamente de un `precioCompra` editable en el producto.

Si se compran cinco unidades a 50 Bs y después cinco a 60 Bs, hace falta una política consistente para valorar lo vendido y lo restante.

Para unidades intercambiables se propone **promedio ponderado móvil**; para prendas únicas, costo específico. IAS 2 contempla identificación específica, FIFO y promedio ponderado según el tipo de inventario. [Referencia](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).

El costo aplicado a cada venta debe conservarse como dato histórico. Una compra posterior no debe cambiar la ganancia de una venta anterior.

Los lotes actuales pueden seguir sirviendo para agrupar compras y analizar su rendimiento, pero:

- Una variante puede recibirse en varios lotes.
- El costo total del lote debe conciliar con los costos asignados a sus unidades.
- El costo del lote y el de las unidades no deben contabilizarse dos veces.
- Los gastos de adquisición que se incorporen al costo deben distribuirse con una regla explícita.

## 9. Evolución propuesta de la base de datos

Se aprovecharía la estructura actual, incorporando estas responsabilidades:

| Colección o módulo | Responsabilidad propuesta |
|---|---|
| `productos` | Modelo comercial, categoría, marca y publicación |
| `variantes` | SKU, talla, color y atributos |
| `existencias` | Cantidades por variante y ubicación |
| `movimientosInventario` | Historial de entradas, salidas y ajustes |
| `compras` y recepciones | Proveedor, cantidades, costos y mercadería recibida |
| `operacionesVenta` y detalles | Venta con variantes, cantidades y costos históricos |
| `cuentasFinancieras` | Caja y cuentas bancarias |
| `pagosCobros` | Pagos reales, parciales o combinados y su aplicación |
| `asientos` | Registro contable equilibrado de cada operación |
| `cierresCaja` | Saldo esperado, conteo y diferencias |

Para dar solidez al sistema se propone **partida doble internamente**, generada automáticamente. El usuario seguiría usando acciones sencillas como «Comprar», «Vender», «Registrar gasto» o «Aportar dinero».

Los pagos, movimientos y asientos serían partes vinculadas de una misma operación, con responsabilidades distintas; no tres registros manuales del mismo ingreso.

Esta tabla define responsabilidades lógicas. El esquema final de documentos, subcolecciones, índices y permisos debe concretarse antes de implementar.

## 10. Aspectos que corregir antes de producción

### Ediciones de ventas e historial

`editarVentaCompleta` vuelve a tomar el costo actual del producto, lo que puede cambiar la ganancia histórica. También intenta eliminar detalles, mientras las reglas de Firestore prohíben eliminar ventas. Véanse [venta.service.ts](../src/app/core/services/venta.service.ts) y [firestore.rules](../firestore.rules).

Para documentos confirmados se deben usar anulaciones, devoluciones y ajustes vinculados, conservando el original. Los borradores sí pueden editarse.

### Consistencia de operaciones simultáneas

Validar y descontar stock, registrar venta y contabilizar sus efectos debe formar una operación consistente. Firestore ofrece transacciones atómicas para confirmar todos los cambios o ninguno. [Documentación oficial](https://firebase.google.com/docs/firestore/manage-data/transactions).

### Reintentos y doble clic

Una identificación única de operación debe impedir ventas o cobros duplicados.

### Validaciones en servidor

Permisos, cantidades, costos y asientos deben validarse en el backend; actualmente buena parte de la lógica vive en Angular.

### Importes y auditoría

Guardar dinero en centavos enteros, aplicar redondeos definidos y conservar responsables, fechas y motivos. La valoración de costos promedio necesita una precisión y política de redondeo explícitas para conservar los totales.

### Verificación antes de liberar

Probar especialmente:

- Venta simultánea de la última unidad.
- Reintentos de la misma operación.
- Anticipos y su aplicación sin doble cobro.
- Cancelaciones y devoluciones parciales.
- Pagos combinados.
- Costos históricos frente a nuevas compras o ediciones.
- Conciliación entre caja, inventario y contabilidad.

## 11. Etapas de implementación

1. **Corregir indicadores actuales.** Distinguir margen bruto, valor del inventario restante y costo de productos registrados. No presentar una suma de productos como aportes personales.
2. **Definir y construir el núcleo financiero y de inventario.** Compras, variantes, existencias, costos y movimientos vinculados a ventas y pagos.
3. **Adaptar los flujos completos.** Reservas, devoluciones, gastos, aportes, retiros, cierres y publicación web.
4. **Migrar y conciliar.** Conservar referencias históricas y verificar cantidades, costos y saldos antes del cambio en producción.

## 12. Migración de los datos actuales

Cada prenda actual puede conservarse como unidad individual. Las equivalencias para agrupar mercadería repetida deben revisarse; no conviene fusionar productos únicamente porque comparten nombre.

Los aportes históricos no pueden deducirse de las compras actuales. Para empezar con cifras fiables hacen falta:

- Una fecha de corte.
- Dinero real en caja y banco.
- Inventario contado y valorizado.
- Deudas y cuentas por cobrar.
- Anticipos pendientes.
- Aportes documentados.

Si faltan registros anteriores, se establece una apertura conciliada sin inventar su origen. La apertura y el historial migrado deben coordinarse para no duplicar movimientos ni saldos.

## 13. Resultado esperado en el panel

El panel debe responder claramente:

- Cuánto aportó el propietario.
- Cuánto ganó el negocio y en qué período.
- Cuánto dinero hay en cada cuenta.
- Cuánto vale la mercadería restante a costo.
- Cuánto se debe y cuánto deben los clientes.
- Cuántas unidades físicas, reservadas, bloqueadas y disponibles hay por variante.

Esta separación resuelve el problema de reinversión y permite crecer hacia una tienda con unidades repetidas, tallas, calzado y accesorios.

## Referencias del repositorio

- [Esquema documentado de Firestore](DATABASE_SCHEMA.md).
- [Resumen e indicadores](../src/app/features/dashboard/resumen/resumen.component.ts).
- [Modelo de producto](../src/app/core/models/producto.model.ts).
- [Modelo de venta](../src/app/core/models/venta.model.ts).
- [Modelo de reserva](../src/app/core/models/reserva.model.ts).
- [Servicio de ventas](../src/app/core/services/venta.service.ts).
- [Servicio de reservas](../src/app/core/services/reserva.service.ts).
- [Análisis de lotes](../src/app/core/services/lote-analytics.service.ts).
- [Reglas de Firestore](../firestore.rules).
- [Dominio actual de lotes](../LOTE_DOMAIN.md).
- [Propuesta previa de inventario y publicación](../PROPUESTA_INVENTARIO_Y_PUBLICACION.md).
