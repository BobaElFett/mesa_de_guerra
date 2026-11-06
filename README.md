# Mesa de Guerra

Mesa de juego virtual en 3D low poly para un wargame de miniaturas sci-fi, para navegador:
la **Legión Astral** (super soldados con servoarmadura) contra **El Enjambre** (criaturas bio-diseñadas).
Three.js + TypeScript, compilado con esbuild a un único `dist/index.html`. Misma base técnica que *Señorío*.

Plan completo (visión, facciones, roadmap y backlog): documento *Mesa de Guerra — Roadmap y plan de desarrollo*.

## Jugar
Abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). No hace falta servidor.

## Novedades 0.1 · fase 0 (cimientos)
- **Mesa:** tablero de madera con patas, tapete de 60" × 44" (1 unidad = 1 pulgada), rejilla de 1" y de 6" (tecla **G**), zonas de despliegue de 10" tintadas en el color de cada bando y sala en penumbra con un foco cálido y sombras.
- **Cámara de mesa** (adaptada de Señorío): WASD o botón central para desplazar, Q/E o botón derecho para girar, rueda de 8" a 120"; cerca se ve a la altura de las miniaturas y lejos desde arriba. **V**: vista cenital. **Inicio**: vista inicial.
- **Miniaturas provisionales:** 5 legionarios (peana de 32 mm) y 10 Garras del Enjambre (peana de 25 mm), cada una fusionada en una malla por color.
- **Mover:** arrastrar con el botón izquierdo; junto al cursor se ven las pulgadas recorridas. **R** gira 45° la miniatura bajo el ratón (Mayús+R al revés). Esc cancela el arrastre.
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
  core/save.ts            guardado en el navegador
  camera/tableCamera.ts   cámara de mesa
  world/table.ts          mesa, tapete, rejilla, zonas de despliegue y sala
  models/lowpoly.ts       ayudantes low poly (caja, colocar, fusionar por color)
  models/miniatures.ts    miniaturas provisionales de la Legión y el Enjambre
  view/piecesView.ts      dibujo de las miniaturas y resaltado
  input/dragControls.ts   coger, arrastrar y soltar miniaturas
  ui/hud.ts               turno, herramientas y dados
```

## Siguiente: fase 1 (mesa sandbox)
Peanas con selección múltiple, cinta métrica, dados en 3D sobre la mesa, escenografía, modelos definitivos de la Escuadra de Asalto Táctico y las Garras Menores, y guardar y cargar mesas con nombre.
