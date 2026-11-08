# Mesa de Guerra

Mesa de juego virtual en 3D low poly para un wargame de miniaturas sci-fi, para navegador:
la **Legión Astral** (super soldados con servoarmadura) contra **El Enjambre** (criaturas bio-diseñadas).
Three.js + TypeScript, compilado con esbuild a un único `dist/index.html`. Misma base técnica que *Señorío*.

Plan completo (visión, facciones, roadmap y backlog): documento *Mesa de Guerra — Roadmap y plan de desarrollo*.

## Jugar
Abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). No hace falta servidor.

## Novedades 0.15 · fase 2 (partida de prueba completa, #25) — fase 2 completa
- **Partida de prueba:** en *Mesas*, el botón *Partida de prueba* despliega dos ejércitos (Legión: Capitán, Asalto Táctico de 10 y de 5, Fuego Pesado — 460 pts; Enjambre: Tirano Sináptico, Guerreros Nodo, Garras Menores de 20, Escupidores de 10 — 450 pts) en sus zonas y activa el modo reglas. Se puede deshacer.
- **Bot:** en modo reglas, el botón *Bot* juega la fase en curso por el bando activo (mover, disparar, cargar y combatir) con las mismas órdenes que un jugador. Sirve para jugar en solitario contra él o para ver una partida entera.
- **Listas y despliegue (base para la fase 3):** `rules/armies.ts` valida listas (tamaños, máx. 3 iguales, 1 grande, un personaje, 500 pts) y la orden `setArmies` las despliega en bloques coherentes en cada zona.
- **Corregido (lo encontró la partida simulada):** al soltar una unidad cerca del límite de movimiento, el recorte al límite podía dejar dos peanas una encima de otra. Ahora la colocación se resuelve de una vez con todas las condiciones (sin solapes, fuera del trabamiento enemigo y dentro de la asignación): cada miniatura va al sitio legal más cercano y, si no hay ninguno, se queda donde estaba.
- **Pruebas:** partidas completas de 5 rondas bot contra bot con 6 semillas, comprobando en cada fase que no hay solapes, que todo está en la mesa y que las unidades cuadran, y que rehacer el registro da exactamente el mismo estado. 53 pruebas en total.
- **Prueba de diversión (datos):** en 40 partidas bot contra bot, la Legión gana 26, el Enjambre 7 y hay 7 empates (≈42 ataques, 12 cargas y 0,7 unidades desmoralizadas por partida). El Enjambre sale flojo: hay que jugar unas partidas a mano antes de tocar los números.
- Los modelos del Capitán, Fuego Pesado, Andador, Tirano, Guerreros Nodo y Escupidores son provisionales (llegan en la fase 3).

## Novedades 0.14 · fase 2 (panel de unidad, #24)
- **Hoja de datos en pantalla:** al seleccionar una unidad (de cualquier bando, en mesa libre o en modo reglas) aparece su ficha: nombre en el color del bando, miniaturas vivas, coste en puntos, etiquetas de estado y sus atributos en una rejilla (M, R, Sv, Inv, H, L, CO).
- Debajo, la **tabla de armas** (alcance, A, HP, F, FP, D y habilidades; las del sargento marcadas), las **habilidades de la unidad** explicadas, las **heridas** de cada miniatura dañada y, en modo reglas, **lo que ha hecho este turno** (movió/avanzó/se retiró, disparó, cargó, combatió, trabada).
- Los botones de la fase en curso (mover, disparar, cargar, combatir) siguen arriba; *Ocultar hoja* pliega el detalle.

## Novedades 0.13 · fase 2 (moral y sinapsis, #23)
- **Chequeos de moral automáticos:** al empezar la fase de mando de un bando (en modo reglas), cada unidad suya por debajo de la mitad (de miniaturas, o de heridas si es de una sola) tira 2D6 contra su L con los dados de la semilla. Un informe enseña cada chequeo.
- **Desmoralizada:** si falla, queda desmoralizada hasta su siguiente fase de mando: CO 0 y sin PM. Se marca con un anillo rojo oscuro en la mesa y una etiqueta en su ficha.
- **Sinapsis:** las unidades del Enjambre a 12" de una unidad Sináptica (Tirano Sináptico, Guerreros Nodo) superan el chequeo sin tirar; su ficha dice «En sinapsis».
- La ficha marca también «Por debajo de la mitad».
- **Retirar a mano (mesa libre):** Supr retira las miniaturas seleccionadas (se puede deshacer). En modo reglas las bajas solo las causan los ataques.
- Código: `rules/morale.ts`, con 4 pruebas nuevas (48 en total).

## Novedades 0.12 · fase 2 (carga y combate, #22)
- **Carga:** en la fase de carga, la ficha de la unidad ofrece *Cargar a…* cada unidad enemiga a 12" o menos, con la distancia y la tirada necesaria en 2D6. Los dados salen de la semilla y ruedan en la bandeja. Si el resultado alcanza para quedar a 1", cada miniatura avanza sola hasta el contacto de peana con la enemiga más cercana (sin solapes); si no, no se mueve. Un aviso dice la tirada y el resultado.
- **Restricciones de carga:** una por unidad y turno; no si ya está trabada; no tras retirarse; no tras avanzar (salvo Rapidez, que tienen las Garras Menores).
- **Combate:** cualquier unidad trabada (de los dos bandos) puede *Combatir contra…* una enemiga con la que esté trabada, una vez por fase. Primero deben combatir las unidades que cargaron con éxito; la ficha lo indica.
- **Cómo se resuelve:** la unidad se agrupa 3" hacia el enemigo, golpean las miniaturas trabadas y las de segunda fila (a ½" de una amiga trabada), cada grupo con su arma cuerpo a cuerpo (el sargento con la espada sierra, el resto con el cuchillo), y después consolida 3". El informe reproduce cada arma seguida, con sus dados.
- La cola del informe cuenta bien las supervivientes tras cada arma; el registro de ataques ya no se recorta.
- Código: `rules/melee.ts` (carga, agruparse, consolidar, quién golpea y orden de combate) y `performAttack`, compartido con el disparo. 5 pruebas nuevas (44 en total).

## Novedades 0.11 · fase 2 (fase de disparo, #21)
- **Disparar:** en la fase de disparo, la ficha de la unidad lista sus armas a distancia con su perfil (24" A2 3+ F4 FP−1 D1…) y, para cada una, un botón por unidad enemiga con la distancia, si está en cobertura y cuántas miniaturas llegan. Al pasar el ratón por el botón, la unidad objetivo se marca en naranja.
- **Quién dispara:** solo las miniaturas que llevan el arma, ven alguna miniatura objetivo (ruinas, contenedores y búnker tapan) y la tienen al alcance. El sargento dispara su pistola por separado.
- **Restricciones:** cada arma dispara una vez por fase; tras avanzar solo armas de Asalto; tras retirarse, nada; una unidad trabada solo dispara pistolas a quien la traba; no se puede disparar a una unidad trabada con las tuyas. Cada botón deshabilitado dice por qué.
- **Resolución:** la orden `shoot` resuelve impactar → herir → salvar → daño con los dados de la semilla, dentro del estado: se puede deshacer y rehacer y sale siempre igual. Cobertura si ninguna miniatura tiradora ve el objetivo sin escenografía de por medio; el daño va primero a las heridas y luego a las más cercanas.
- **Paso a paso:** un informe arriba enseña cada tirada (impactar, herir, salvar) con sus dados en fichas (verdes los éxitos) mientras ruedan en la bandeja; *Ver bandeja* lleva la cámara allí y *Saltar* va al final. Las bajas se quedan en la mesa hasta las salvaciones y luego caen.
- Código: `rules/shooting.ts` (opciones, alcance, visión, cobertura y resolución), `view/shotPlayer.ts` (reproducción) y el registro de ataques `combatLog` en el estado. 6 pruebas nuevas (39 en total).

## Novedades 0.10 · fase 2 (fase de movimiento, #20)
- **Unidad entera:** en modo reglas, un clic selecciona toda la unidad y aparece su ficha (atributos y miniaturas vivas). **Alt+clic** selecciona una sola miniatura para recolocarla dentro de la formación.
- **Fase de movimiento:** la unidad elige en su ficha **Mover** (hasta M), **Avanzar** (M + D6; el dado sale de la semilla, se ve en la bandeja y se puede deshacer) o **Retirarse** (solo si está trabada). Arrastrarla sin elegir es un movimiento normal.
- **Límites:** cada miniatura puede alejarse como mucho su asignación desde donde empezó la fase, aunque se arrastre varias veces. Mientras se arrastra, la etiqueta dice «4,2" de 6"» y la miniatura no pasa del límite. Unos círculos azules marcan hasta dónde llega cada una.
- **Trabada:** una unidad a 1" de un enemigo solo puede retirarse o quedarse quieta. Ninguna miniatura puede acabar un movimiento a 1" de un enemigo: si se suelta ahí, vuelve a su sitio y se avisa.
- **Fuera de turno:** en modo reglas no se pueden mover las miniaturas del otro bando ni mover nada fuera de la fase de movimiento (la Mesa libre sigue permitiéndolo todo).
- Se apunta cómo movió cada unidad (avanzar o retirarse) para las restricciones de disparo y carga que llegan en las siguientes fases.
- Simplificación de esta versión: se mide en línea recta desde el origen; todavía no se comprueba el camino (atravesar enemigos o escenografía).
- Código: `rules/movement.ts` (asignaciones, recorte, trabamiento y restricciones) y `input/rulesGate.ts` (lo que el modo reglas permite a la mano), con 7 pruebas nuevas (33 en total).

## Novedades 0.9 · fase 2 (visión, coherencia y fases del turno, #18 y #19)
- **Modo reglas** (botón *Mesa libre* / *Modo reglas*): el panel del turno muestra las cinco fases (Mando, Movimiento, Disparo, Carga, Combate) con la actual resaltada, los PM de cada bando y una línea que explica qué se hace en esa fase. **Intro** o *Siguiente fase* avanza; tras el combate pasa al otro bando. Cada fase de mando da 1 PM a los dos. Tras la ronda 5 la partida termina.
- En **mesa libre** todo sigue como antes: *Pasar turno* y sin límite de rondas. Las fases aún no limitan nada; eso llega con las fases de movimiento, disparo y combate.
- **Visión en la cinta:** al medir de una miniatura a otra enemiga, la etiqueta dice *visible*, *en cobertura* o *sin visión*. Ruinas, contenedores y búnker tapan la vista (salvo estando dentro); cráteres y barricadas no la tapan, pero dan cobertura. Se comprueban tres líneas por pareja (centro y bordes): si alguna pasa, hay visión; si alguna cruza escenografía, hay cobertura.
- **Coherencia:** al seleccionar una miniatura, las de su unidad que están a más de 2" de las demás (de dos, con 6 o más miniaturas) se marcan en rojo y el panel de selección lo avisa.
- Código: `rules/geometry.ts` (coherencia, trabamiento a 1", huellas de escenografía, visión y cobertura) y `rules/turn.ts` (fases, PM y rondas), con 9 pruebas nuevas (26 en total). Órdenes nuevas: `nextPhase`, `setRulesMode` y `spendCP`.

## Novedades 0.8 · fase 2 (hojas de datos y secuencia de ataque, #16 y #17)
- **Reglamento v0.1** en la pestaña *Reglamento* del documento del proyecto: atributos M, R, Sv, Inv, H, L y CO; armas con alcance, A, HP, F, FP y D; habilidades de arma; turno de cinco fases; moral y sinapsis; ejércitos de 500 puntos.
- **Hojas de datos en el código** (`rules/datasheets.ts`): las 8 unidades (Capitán, Escuadra de Asalto Táctico, Escuadra de Fuego Pesado, Andador de Combate, Tirano Sináptico, Garras Menores, Escupidores y Guerreros Nodo), sus 16 armas, sus habilidades y sus puntos.
- **Unidades en el estado:** cada miniatura pertenece a una unidad (la Escuadra de Asalto Táctico U1 y las Garras Menores U2 en la mesa inicial) y lleva el daño recibido.
- **Secuencia de ataque** (`rules/attack.ts`), pura y con dados del RNG del estado: impactar (críticos con 6, 1 siempre falla, modificadores ±1), herir con la tabla F contra R, salvar con FP, cobertura e invulnerable, y repartir el daño empezando por la miniatura herida (el sobrante se pierde). Habilidades: Pesada, Ráfaga, Sostenida, Letal, Devastadora, Explosiva, Torrente y Blindado, además de repetir los 1 (Al mando).
- **Pruebas:** `npm test` ejecuta 17 pruebas (tabla de herir, salvaciones, la secuencia con dados fijos, cada habilidad, reparto del daño, una prueba estadística de 10 000 disparos, determinismo, puntos, colocación sin solapes y deshacer).
- Todavía no hay cambios visibles en la mesa: esto es la base de las fases de disparo y combate.

## Novedades 0.7 · fase 1 (guardar y cargar mesas, #12) — fase 1 completa
- **Mesas con nombre:** el botón **Mesas** abre la biblioteca. Pon un nombre y *Guardar*; si el nombre ya existe, se sustituye esa mesa. Cada mesa guardada muestra la ronda, de quién es el turno, cuántas órdenes lleva y cuándo se guardó.
- **Ctrl+S:** guarda al momento con el nombre actual (aviso arriba); si la mesa aún no tiene nombre, abre el diálogo.
- **Cargar y borrar** piden un segundo clic, para no perder la mesa actual por accidente. El nombre de la mesa actual se ve en el panel del turno; *Nueva mesa* empieza una sin nombre.
- **Exportar e importar:** cualquier mesa (o la actual) se descarga como `nombre.mesa.json`. *Importar archivo…* la añade a la biblioteca (con «(2)» si el nombre ya está) y la carga. Los archivos que no son JSON, no son de Mesa de Guerra o están dañados se rechazan con un mensaje, sin tocar la mesa actual.
- Un archivo guarda la semilla y la lista de órdenes, así que pesa pocos KB y reproduce la partida exacta, dados incluidos.
- Con el diálogo abierto, los atajos de la mesa (Espacio, WASD, R…) no actúan.

## Novedades 0.6 · fase 1 (modelos definitivos, #11)
- **Legionario de la Escuadra de Asalto Táctico:** hombreras grandes con ribete dorado y emblema, pecho con águila, mochila con toberas, rodilleras, casco con rejilla y visor luminoso, y bólter con cargador y mira. Tres poses: *apuntando*, *en guardia* (rifle cruzado) y *avanzando* (zancada, rifle bajo).
- **Sargento:** casco rojo con cresta y laurel, pistola al frente, espada sierra en alto y un estandarte pequeño en la mochila. La peana lleva el borde dorado.
- **Garra Menor del Enjambre:** patas digitígradas, placas de quitina en el lomo, cola segmentada, cabeza alargada con cresta, mandíbulas y ojos que brillan, guadañas curvas y bracitos con garras. Tres poses: *acechando*, *lanzándose* y *erguida*.
- **Alfa del enjambre:** un 15 % más grande, quitina más oscura, cresta alta, espinas de hueso en el lomo y sacos que brillan en violeta.
- Peanas con superficie de tierra y piedrecitas. Cada pieza guarda su `pose` y si es `leader`; en la mesa inicial cada escuadra mezcla las tres poses y lleva su líder en el centro.
- Los modelos se construyen por articulaciones (nuevos ayudantes `segment` y `spike`): una pose es otro juego de puntos. Las miniaturas iguales comparten geometría.

## Novedades 0.5 · fase 1 (escenografía, #10)
- **Seis piezas low poly:** ruina (6"×4"), ruina grande de dos alturas (8"×6"), contenedores (4"×3"), cráter (5"), búnker (6"×4") y barricada (4"×1"). Los muros son rotos, con ventanas y cascotes, y siempre salen iguales.
- **Mapa de ejemplo:** cada mesa nueva trae 11 piezas en disposición simétrica (búnker en el centro y cinco piezas por bando), así ninguno de los dos lados tiene ventaja. Las mesas guardadas con versiones anteriores lo reciben al cargarse.
- **Bloqueada por defecto:** la escenografía no se coge al hacer clic, para poder seleccionar y medir las miniaturas que hay dentro o detrás. **T** o *Escenografía* la desbloquea y abre el panel.
- **Editar:** desbloqueada, se selecciona, se arrastra y se gira (**R**) como las miniaturas, y se borra con **Supr**. El panel añade cualquier pieza en el centro de la vista. La selección se marca con un rectángulo dorado.
- Todo son órdenes (`addTerrain`, `removeTerrain` y `moveMany`, que ahora también mueve escenografía): se deshace, se guarda y se reproduce igual en cualquier navegador.
- Las miniaturas se pueden poner dentro de las ruinas; todavía no se suben a los pisos altos ni encima del búnker.

## Novedades 0.4 · fase 1 (dados en 3D, #9)
- **Bandeja de dados** en un estante a la derecha de la mesa (fondo de fieltro, paredes de madera). **B** o *Ver bandeja* lleva la cámara allí.
- **Dados en 3D:** cada tirada se lanza en la bandeja; los dados ruedan, chocan entre sí y con las paredes, y se asientan planos sin quedar unos encima de otros. Hasta 40 dados de 16 mm con sus puntos.
- **El resultado lo manda el estado:** primero se deciden los dados con la semilla y después se simula el lanzamiento; al acabar, el dibujo de cada dado se gira para que la cara de arriba sea su resultado. La animación nunca contradice al panel.
- **Marcar y repetir:** clic en un dado de la bandeja lo marca (dorado); *Marcar unos* marca todos los 1. *Repetir N* vuelve a tirar solo los marcados, que se lanzan otra vez mientras los demás se quedan quietos. Es una orden nueva (`reroll`), con su deshacer, y el panel indica cuántos se han repetido.
- **Ordenar** coloca los dados en filas por resultado, de 6 a 1. **Retirar** los quita de la bandeja (la tirada sigue en el registro).
- Al deshacer, rehacer o cargar, los dados aparecen ya quietos, sin animación.

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
npm test         # pruebas de reglas y del núcleo
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
  core/save.ts            guardado automático, biblioteca de mesas y archivos .json
  camera/tableCamera.ts   cámara de mesa
  world/table.ts          mesa, tapete, rejilla, zonas de despliegue, bandeja y sala
  models/lowpoly.ts       ayudantes low poly (caja, hueso entre dos puntos, púa, fusionar por color)
  models/miniatures.ts    legionario, sargento, Garra y alfa, con 3 poses cada uno
  models/terrain.ts       escenografía: ruinas, contenedores, cráter, búnker y barricada
  view/piecesView.ts      dibujo de miniaturas y escenografía, y resaltado
  input/pieceControls.ts  selección, recuadro, arrastre y giro en grupo
  input/picker.ts         rayo del ratón: miniatura y punto del tapete
  tools/tapeMeasure.ts    cinta métrica
  view/rangeRings.ts      círculos de alcance alrededor de la selección
  view/dice.ts            dados 3D: modelo, simulación, bandeja, marcar y ordenar
  rules/datasheets.ts     hojas de datos, armas, habilidades y puntos
  rules/attack.ts         secuencia de ataque: impactar, herir, salvar, daño
  rules/geometry.ts       coherencia, trabamiento, visión y cobertura
  rules/turn.ts           fases del turno, puntos de mando y rondas
  rules/movement.ts       fase de movimiento: mover, avanzar, retirarse y límites
  rules/shooting.ts       fase de disparo: armas, objetivos, restricciones y resolución
  rules/melee.ts          fases de carga y combate
  rules/morale.ts         moral, desmoralizadas y sinapsis
  rules/armies.ts         listas de ejército, validación y despliegue
  ai/bot.ts               bot que juega una fase con las órdenes normales
  input/rulesGate.ts      lo que el modo reglas permite mover en cada fase
  view/shotPlayer.ts      reproduce un ataque paso a paso con informe y dados
  ui/hud.ts               turno, herramientas y dados
  ui/tablesDialog.ts      diálogo Mesas: guardar, cargar, borrar, exportar, importar
```

## Siguiente: fase 3 (ejércitos)
Modelos del Capitán, Fuego Pesado, Andador, Tirano, Guerreros Nodo y Escupidores (#26–#29), editor de listas de 500 puntos (#30), despliegue de las listas (#31) y líderes unidos a escuadras (#32).
