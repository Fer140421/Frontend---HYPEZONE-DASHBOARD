# Propuesta: inventario separado de la publicación web

## Situación actual

El sistema registra cada prenda como un producto individual dentro del inventario.
Aunque las fotos no son obligatorias técnicamente, al crear una prenda también se crea
automáticamente su copia pública para la tienda web. Esto permite que una prenda sin fotos
pueda llegar a aparecer en línea, lo cual no es deseable.

Además, para registrar una prenda que aún no fue fotografiada, actualmente se debe esperar o
llevar un registro temporal externo, por ejemplo en Excel. Esto genera doble trabajo y el riesgo
de olvidar registrar prendas.

## Objetivo

Permitir registrar una prenda apenas ingresa al negocio, aun si no tiene fotos, sin que se
publique automáticamente en la web.

## Flujo recomendado

Separar dos conceptos que hoy están vinculados:

1. **Inventario:** indica si la prenda existe físicamente y si está disponible, reservada o vendida.
2. **Publicación web:** indica si la prenda puede mostrarse al público en la tienda en línea.

El flujo sería el siguiente:

1. Se registra la prenda en el sistema con sus datos básicos, aunque todavía no tenga fotos.
2. La prenda queda guardada en el inventario como **Borrador** o **Pendiente de fotos**.
3. La prenda no aparece en la web mientras esté en borrador.
4. Cuando se cargue al menos una foto y se completen los datos necesarios, se habilita la acción
   **Publicar en web**.
5. El usuario puede pausar u ocultar una publicación sin borrar la prenda ni perder su historial
   de inventario.

## Estados propuestos para publicación

Se recomienda agregar un campo independiente, por ejemplo:

```ts
publicacion: 'borrador' | 'publicado' | 'pausado'
```

- **borrador:** prenda registrada internamente; aún no se muestra en la web.
- **publicado:** prenda visible para el público, siempre que esté disponible.
- **pausado:** prenda conservada en inventario, pero temporalmente oculta de la web.

El campo actual `activo` debe conservar su significado de baja lógica o eliminación, por lo que
no conviene utilizarlo para controlar la publicación.

## Reglas de publicación

Para evitar productos incompletos en la tienda web, al publicar se debe validar que la prenda:

- tenga al menos una foto;
- tenga nombre, talla, categoría y descripción;
- tenga un precio de venta válido;
- esté activa y con estado `disponible`.

Si falta alguno de estos datos, el sistema debe explicar qué falta antes de permitir la publicación.

## Mejoras en la pantalla de productos

Agregar filtros e indicadores para identificar rápidamente las prendas pendientes:

- Sin fotos.
- Borrador / pendiente de publicar.
- Publicado en web.
- Publicación pausada.
- Disponible, reservada o vendida.

También se pueden incorporar dos acciones visibles:

- **Guardar como borrador** al registrar una prenda.
- **Publicar en web** cuando cumpla las condiciones.

## Cómo funciona el stock actualmente

El sistema trabaja con el modelo **una prenda = una unidad de stock**. Cada producto tiene un
estado operativo:

- `disponible`: la prenda puede venderse;
- `reservado`: la prenda está apartada;
- `vendido`: la prenda ya no forma parte del stock disponible.

Por tanto, el stock disponible se obtiene contando las prendas cuyo estado es `disponible`. Las
ventas y reservas cambian automáticamente el estado de la prenda, manteniendo el inventario
actualizado.

Este modelo es adecuado para ropa única, prendas de segunda mano o artículos con características
individuales. Si se venderán varias unidades idénticas de un mismo producto, se debería incorporar
en el futuro un campo como `cantidadStock` y un historial de movimientos de inventario.

## Resultado esperado

Con esta mejora, el sistema podrá utilizarse como registro inmediato de inventario sin depender de
Excel ni de tener las fotografías listas. La publicación en la web quedará como una decisión
separada y controlada, evitando mostrar prendas sin imágenes o con información incompleta.
