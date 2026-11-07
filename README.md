# Mesa de Guerra

Mesa de juego virtual en 3D low poly para un wargame de miniaturas sci-fi, para navegador:
la **Legión Astral** (super soldados con servoarmadura) contra **El Enjambre** (criaturas bio-diseñadas).
Three.js + TypeScript, compilado con esbuild a un único `dist/index.html`. Misma base técnica que *Señorío*.

Plan completo (visión, facciones, roadmap y backlog): documento *Mesa de Guerra — Roadmap y plan de desarrollo*.

## Jugar
Abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). No hace falta servidor.

## Novedades 0.3 · fase 1 (cinta métrica, #8)
- **Cinta métrica** (tecla **M** o botón *Cinta*): clic y arrastre sobre la mesa mide en pulgadas. Si un extremo está en una miniatura, mide desde el borde de su peana; de peana a peana mide **borde a borde**, como en el tablero real. La cinta es amarilla, con una marca por pulgada y otra más larga cada 6", y se ve a través de las miniaturas.
- La medida **sigue a las miniaturas** si se mueven (o al deshacer) y se queda en la mesa hasta medir otra vez, un clic sin arrastrar, o **Esc** (el segundo Esc cierra la herramienta). Con la cinta activa, el clic izquierdo no selecciona ni mueve miniaturas.
- **Círculos de alcance** (tecla **C**, Mayús+C hacia atrás, o botón *Alcance*): alrededor de cada miniatura seleccionada, a 3", 6", 12", 18" o 24" del borde de su peana.
- Medir no es una orden: no se guarda ni se deshace.
- El panel del turno pasa abajo al centro, para que no lo tape la barra de herramientas.
- Código: `core/measure.ts` (medida borde a borde, pura, para las reglas de la fase 2), `input/picker.ts` (rayo compartido), `tools/tapeMeasure.ts` y `view/rangeRings.ts`.

## Novedades 0.2 · fase 1 (selección y grupos, #6 y #7)
- **Seleccionar:** clic en una miniatura; **Mayús+clic** añade o quita; arrastrar sobre el tapete traza un **recuadro de selección** (con Mayús, añade). **Ctrl+A** selecciona todo el bando que juega. **Esc** suelta la selección. Las seleccionadas llevan un anillo dorado y la que está bajo el ratón, uno tenue; abajo a la izquierda se ve cuántas hay de cada bando.
- **Mover en grupo:** al arrastrar una miniatura seleccionada se mueve toda la selección conservando la formación, sin salirse del tapete; la medida muestra las pulgadas recorridas.
- **Girar en grupo:** **R** (o Mayús+R) gira 45° la selección alrededor de su centro: cambian la orientación y la formación.
- **Sin solapes:** al soltar o girar, cada peana movida va al hueco libre más cercano a donde cayó; las que no se movían no se tocan. Es determinista (igual en cualquier navegador).
- **Una orden por gesto:** mover o girar un grupo es una sola orden `moveMany`, así que un Ctrl+Z lo deshace entero. Las mesas guardadas con la v0.1 se siguen cargando.
- Corregido: en los 3 primeros segundos tras abrir el juego, un solo clic en *Nueva mesa* borraba la mesa sin pedir confirmación.

## Novedades 0.1 · fase 0 (cimientos)
- **Mesa:** tablero de madera con patas, tapete de 60" × 44" (1 unidad = 1 pulgada), rejilla de 1" y de 6" (tecla **G**), zonas de despliegue de 10" tintadas en el color de cada bando y sala en penumbra con un foco cálido y sombras.
- **Cámara de mesa** (adaptada de Señorío): WASD o botón central para desplazar, Q/E o botón derecho para girar, rueda de 8" a 120"; cerca se ve a la altura de las miniaturas y lejos desde arriba. **V**: vista cenital. **Inicio**: vista inicial.
- **Miniaturas provisionales:** 5 legionarios (peana de 32 mm) y 10 Garras del Enjambre (peana de 25 mm), cada una fusionada en una malla por color.
- **Mover:** arrastrar con el botón izquierdo; junto al cursor se ven las pulgadas recorridas. **R** gira 45° la miniatura bajo el ratón. Esc cancela el arrastre.
- **Estado y órdenes:** toda acción (mover, girar, tirar dados, pasar turno) es una orden que se aplica al estado de la partida. **Ctrl+Z** deshace y **Ctrl+Y** rehace, sin límite.
- **Dados con semilla:** el generador vive dentro del estado, así que deshacer y rehacer una tirada da los mismos dados (y en el futuro dos navegadores verán lo mismo). **Espacio** tira, **+**/**−** cambian cuántos; los resultados salen ordenados y agrupados («2×6 1×5…»), con las cinco tiradas anteriores debajo.
- **Turnos:** ronda y bando activo arriba; **Intro** o *Pasar turno*.
- **Guardado:** automático en el navegador (semilla y lista de órdenes). *Nueva mesa* (dos clics) empieza otra.

## Desarrollar (requiere Node.js 20+)
```
npm install
npm run dev      # recompila dist/index.html al guardar
npm run build    # build final minificado
npm run check    # comprobación de tipos
```
En la consola del navegador, `mesa.bus` da acceso al estado y a las órdenes para probar.

## Arquitectura
1. **Estado separado del dibujo.** `GameState` (core/state.ts) es JSON puro; la vista solo lo lee.
2. **Todo cambio es una orden.** `applyCommand` (core/commands.ts) es una función pura; `CommandBus` guarda la lista de órdenes y reconstruye el estado al deshacer.
3. **Azar con semilla dentro del estado** (core/rng.ts).

## Estructura
```
src/
  main.ts                 escena, luces, teclado y bucle principal
  core/state.ts           estado de la partida, tablero y despliegue inicial
  core/commands.ts        órdenes, applyCommand y CommandBus (deshacer/rehacer)
  core/rng.ts             generador aleatorio con semilla y dados
  core/placement.ts       colocación sin solapes (hueco libre más cercano)
  core/measure.ts         medida borde a borde y alcances
  core/save.ts            guardado en el navegador
  camera/tableCamera.ts   cámara de mesa
  world/table.ts          mesa, tapete, rejilla, zonas de despliegue y sala
  models/lowpoly.ts       ayudantes low poly (caja, colocar, fusionar por color)
  models/miniatures.ts    miniaturas provisionales de la Legión y el Enjambre
  view/piecesView.ts      dibujo de las miniaturas y resaltado
  input/pieceControls.ts  selección, recuadro, arrastre y giro en grupo
  input/picker.ts         rayo del ratón: miniatura y punto del tapete
  tools/tapeMeasure.ts    cinta métrica
  view/rangeRings.ts      círculos de alcance alrededor de la selección
  ui/hud.ts               turno, herramientas y dados
```

## Siguiente en la fase 1 (mesa sandbox)
Dados en 3D sobre la mesa (#9), escenografía (#10), modelos definitivos de la Escuadra de Asalto Táctico y las Garras Menores (#11), y guardar y cargar mesas con nombre (#12).
