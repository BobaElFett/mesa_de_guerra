# Mesa de Guerra

Mesa de juego virtual en 3D low poly para un wargame de miniaturas sci-fi, en el navegador:
la **Legión Astral** (super soldados con servoarmadura) contra **El Enjambre** (criaturas bio-diseñadas).
Se juega como en una mesa de verdad (mover, medir y tirar dados) o con el **modo reglas**, que guía las fases y resuelve las tiradas.
Three.js + TypeScript, compilado con esbuild a un único `dist/index.html`.

Versión **0.42**. Lo nuevo de cada versión está en [CHANGELOG.md](CHANGELOG.md); el plan, en el documento *Mesa de Guerra — Roadmap y plan de desarrollo*.

## Jugar
Abre `dist/index.html` con doble clic (Chrome, Edge o Firefox). No hace falta servidor ni conexión.
Al abrirlo sale el menú:

- **Jugar contra la IA:** bando, dificultad (Fácil, Normal, Difícil), misión, condiciones, mapa y listas (de prueba, las tuyas o al azar). También se puede **mirar IA contra IA**.
- **Campaña:** tres batallas seguidas; las unidades que sobreviven y hacen daño pasan a Veteranas.
- **Tutorial:** tres lecciones guiadas (lo básico; reservas, consejos y estratagemas; órdenes secundarias y tropas especiales).
- **Desafíos:** cinco escenarios cortos con estrellas.
- **Códice:** todas las unidades con su miniatura, perfil y trasfondo.
- **Mesa libre:** sin reglas automáticas, como en Tabletop Simulator.
- **Ejércitos**, **Historial** (con logros), **En línea** (dos ordenadores) y **Ajustes**.

## Cómo se juega (modo reglas)
Cada bando tiene un ejército de **500 puntos** (*Escaramuza*) o **1.000** (*Batalla*). La partida dura **5 rondas**; en cada una juegan los dos bandos su turno, con cinco fases:

1. **Mando:** +1 punto de mando (PM) por bando para estratagemas; las unidades por debajo de la mitad chequean moral (2D6 contra su Liderazgo).
2. **Movimiento:** mover (hasta M), avanzar (+D6, sin disparar ni cargar después) o retirarse del combate. Desde la ronda 2 llegan las **reservas**, a más de 9" del enemigo.
3. **Disparo:** clic en un enemigo y elegir arma. Impactar (HP), herir (Fuerza contra Resistencia), salvar (armadura o invulnerable) y daño. Las líneas de visión dicen quién ve y quién tiene cobertura; los psíquicos usan aquí su poder.
4. **Carga:** a 12" o menos, 2D6 para llegar; el cargado puede hacer fuego defensivo (impacta a 6).
5. **Combate:** quien cargó golpea primero; luego se alternan.

**Misiones:** *Toma y mantén*, *Corazón del frente*, *Caza de presas* (PV por puntos destruidos), *Reliquia* (se recoge y se lleva), *Asalto* (asimétrica: uno ataca y otro defiende) y *Cabeza de la serpiente* (PV por cada personaje enemigo destruido). Gana quien tenga más PV tras la ronda 5.
**Mapas:** de ejemplo, aleatorio, *Ruinas urbanas*, *Llanura* y *Bosque* (los bosques se atraviesan, dan cobertura y tapan la visión si se cruzan más de 3"), todos simétricos.
**Condiciones:** *Noche* (nada dispara a más de 24") y *Tormenta* (−1 a impactar a más de 12").

## Ejércitos
Máximo 3 unidades iguales y 1 Andador o Tirano (el doble a 1.000 puntos); al menos un personaje. Varias unidades tienen **equipo opcional** (casillas en Ejércitos) y las de Despliegue profundo o Túneles pueden empezar **en reserva** (hasta la mitad de los puntos).

| Legión Astral | M | R | Sv | H | Puntos | Armas | Habilidades |
|---|---|---|---|---|---|---|---|
| **Capitán** (personaje) | 6" | 4 | 3+/4++ | 5 | 1: 80 | Pistola de plasma, Espada de energía | Al mando |
| **Escuadra de Asalto Táctico** | 6" | 4 | 3+ | 2 | 5: 90 · 10: 170 | Rifle bólter, Cuchillo de combate, Pistola bólter, Espada sierra | Sargento |
| **Escuadra de Fuego Pesado** | 5" | 4 | 3+ | 2 | 5: 140 | Cañón pesado, Cuchillo de combate | — |
| **Andador de Combate** | 8" | 9 | 2+ | 12 | 1: 170 | Cañón de asalto, Puño de combate | Blindado |
| **Exterminadores** | 5" | 5 | 2+/4++ | 3 | 5: 175 | Bólter de asalto, Puño de energía | Despliegue profundo |
| **Psíquico de la Legión** (personaje) | 6" | 4 | 3+/5++ | 4 | 1: 70 | Pistola bólter, Báculo psíquico | Psíquico |
| **Motoristas de Asalto** | 12" | 5 | 3+ | 2 | 3: 90 · 6: 180 | Bólter gemelo, Cuchillo de combate | Turbo |
| **Francotiradores** | 6" | 4 | 3+ | 2 | 5: 100 | Rifle de precisión, Cuchillo de combate | Infiltrador |

| El Enjambre | M | R | Sv | H | Puntos | Armas | Habilidades |
|---|---|---|---|---|---|---|---|
| **Acechadores** | 8" | 5 | 4+ | 3 | 3: 75 · 6: 150 | Cuchillas dobles | Túneles, Rapidez |
| **Mente del Enjambre** (personaje) | 6" | 5 | 4+/5++ | 5 | 1: 60 | Garras afiladas | Psíquico, Sináptico; lidera Garras, Escupidores o Nodo |
| **Carnífice** | 8" | 9 | 2+ | 10 | 1: 190 | Lanzapinchos, Guadañas monstruosas | Aterrador |
| **Tirano Sináptico** (personaje) | 8" | 9 | 2+/5++ | 11 | 1: 195 | Garras monstruosas, Escupe-bilis | Sináptico |
| **Garras Menores** | 8" | 4 | 5+ | 1 | 10: 55 · 20: 110 | Garras | Rapidez |
| **Escupidores** | 6" | 3 | 4+ | 1 | 10: 55 · 20: 110 | Escupidor, Mordiscos | — |
| **Gárgolas** | 12" | 3 | 6+ | 1 | 10: 70 · 20: 140 | Escupe-púas, Garras aladas | Vuelo |
| **Guerreros Nodo** | 6" | 5 | 4+ | 3 | 3: 80 · 6: 160 | Cañón bio, Garras afiladas | Sináptico |

## Ayudas
- **Sugerir** (**H**): lo que haría la IA Difícil, en dorado, sin hacerlo.
- **Ctrl+Z** contra la IA: deshace tu última jugada y lo que hizo la IA después.
- **Registro** (**L**), **repetición** al acabar, **estadísticas** por unidad y **unidad de la partida**.
- **?**: todos los atajos de teclado. La ayuda de la izquierda tiene buscador.
- **Órdenes secundarias** (opción de la partida rápida y de Ejércitos): 2 órdenes por bando y turno que dan PV extra; se ven en el panel de la misión.
- **Resumen del turno rival:** al volver a tu turno, lo que hizo la IA (o tu rival en línea): tus bajas, lo que destruiste, PV, cargas, estratagemas y órdenes.
- **Iconos sobre las unidades:** lo que ha hecho cada una este turno (mover, avanzar, disparar, cargar, combatir, poder, estratagema) y si está desmoralizada.
- **Ajustes:** sonido y ambiente, velocidad de los ataques, gráficos (*Rápidos* para equipos modestos), tamaño de la interfaz, colores de cada bando y colores para daltónicos; animaciones e iconos de las unidades, que se pueden apagar.
- Pantalla táctil: un dedo como el ratón, dos dedos para acercar, girar y desplazar.

## Desarrollar (requiere Node.js 20+)
```
npm install
npm run dev      # recompila dist/index.html al guardar
npm run build    # build final minificado
npm run check    # comprobación de tipos
npm test         # pruebas (reglas, IA, campaña, red y prueba de resistencia)
```
En la consola del navegador, `mesa` da acceso al bus de órdenes, la cámara y las vistas para probar.

## Arquitectura
1. **Estado separado del dibujo.** `GameState` (core/state.ts) es JSON puro; la vista solo lo lee.
2. **Todo cambio es una orden.** `applyCommand` (core/commands.ts) es una función pura; `CommandBus` guarda las órdenes, reconstruye el estado al deshacer y da la repetición. En línea se envían las órdenes, no el estado.
3. **Azar con semilla dentro del estado** (core/rng.ts): las mismas órdenes dan siempre la misma partida.

## Estructura
```
src/
  main.ts                 escena, luces, ventanas, teclado y bucle principal
  core/                   estado, órdenes y bus, azar, colocación sin solapes, medidas, guardado
  camera/tableCamera.ts   cámara de mesa (ratón, teclado y táctil)
  world/table.ts          mesa, tapete, rejilla y zonas de despliegue
  models/                 miniaturas y escenografía low poly (una malla por modelo)
  view/                   miniaturas, dados, disparos, objetivos, alcances, línea de visión,
                          sugerencias, llegada de reservas y zonas sólidas
  input/                  selección y arrastre, rayo del ratón, lo que permite el modo reglas
  tools/tapeMeasure.ts    cinta métrica
  rules/                  hojas de datos y equipo, ataque, visión y cobertura, turno, movimiento,
                          disparo, carga y combate, moral y sinapsis, líderes, estratagemas,
                          fuego defensivo, reservas, psíquicos, misiones y reliquia, condiciones,
                          mapas, listas (también al azar), estadísticas, campaña, registro
  ai/                     IA táctica (Normal y Difícil), bot (Fácil), despliegue, llegadas,
                          sugerencias, controlador y ajustes
  net/                    partidas en línea: protocolo, sesión, transportes y PeerJS
  audio/sfx.ts            sonidos sintetizados
  ui/                     panel de turno y ficha, menú, ajustes, ejércitos, campaña, historial,
                          tutorial, resumen final, repetición, registro, mesas y red
tests/                    pruebas con node:test (más de 170)
```
