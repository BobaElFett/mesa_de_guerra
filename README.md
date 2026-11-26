# Mesa de Guerra

Mesa de juego virtual en 3D low poly para un wargame de miniaturas sci-fi, en el navegador:
la **Legión Astral** (super soldados con servoarmadura) contra **El Enjambre** (criaturas bio-diseñadas).
Se juega como en una mesa de verdad (mover, medir y tirar dados) o con el **modo reglas**, que guía las fases y resuelve las tiradas.
Three.js + TypeScript, compilado con esbuild a un único `dist/index.html`.

Versión **0.52**. Lo nuevo de cada versión está en [CHANGELOG.md](CHANGELOG.md); el plan, en el documento *Mesa de Guerra — Roadmap y plan de desarrollo*.

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
Cada bando tiene un ejército de **1.000 puntos** (*Incursión*, como en la 11.ª edición) o **500** (*Escaramuza*). La partida dura **5 rondas**; en cada una juegan los dos bandos su turno, con cinco fases:

1. **Mando:** +1 punto de mando (PM) por bando para estratagemas; chequean moral las unidades a la mitad o menos y las desmoralizadas (2D6 contra su Liderazgo; 3D6 en sinapsis; si la superan, se recuperan).
2. **Movimiento:** mover (hasta M), avanzar (+D6, sin disparar ni cargar después) o retirarse del combate (desmoralizada, con tiradas de peligro). Nadie acaba a 2" o menos de un enemigo si no es cargando. No se atraviesan miniaturas enemigas (los monstruos y vehículos, sí la infantería; la huida desesperada, todo). Las unidades con **Vuelo** pueden surcar los cielos: 2" menos, por encima de todo. Desde la ronda 2 llegan las **reservas**: por un borde de la mesa (a 6" o menos; hasta la ronda 3, fuera de la zona rival) o, con Despliegue profundo o Túneles, a cualquier punto; siempre a más de 8" del enemigo.
3. **Disparo:** elige tu unidad y haz clic en un enemigo (cada uno lleva una etiqueta con las bajas esperadas). El **panel de ataque** muestra todas las armas con lo que necesitan para impactar, herir y salvar, los modificadores y las bajas esperadas; un botón dispara todas las marcadas. Impactar (HP), herir (Fuerza contra Resistencia), salvar (armadura o invulnerable) y daño. La **cobertura** empeora en 1 la HP del que dispara; la infantería dispara o sus armas de **corto alcance** o las demás. La escenografía ligera o densa tapa la visión, y la infantería **oculta** dentro de ella solo se ve a 15".
4. **Carga:** a 12" o menos, 2D6 para llegar (el panel da la probabilidad).
5. **Combate:** los dos jugadores se alternan eligiendo unidad, empezando por las que golpean primero (han cargado o tienen Golpea primero); una tira muestra el orden. Cada miniatura golpea con su mejor arma de combate y, además, con las de *Ataques extra*.

**Estratagemas (11.ª):** cada una cuesta PM y se usa una vez por fase; una unidad solo recibe una por fase. Las básicas: *Repetición de mando*, *Desafío épico*, *Valor demente*, *Explosivos*, *Impacto aplastante* y *Contraofensiva*. En el turno del rival se abren **ventanas de reacción**: al acabar su movimiento, *Fuego defensivo* (impacta a 6); al empezar su disparo, *Cortina de humo*; al acabar su carga, *Intervención heroica*. La partida espera a que decidas.

**Misiones:** *Toma y mantén*, *Corazón del frente*, *Caza de presas* (PV por puntos destruidos), *Reliquia* (se recoge y se lleva), *Asalto* (asimétrica: uno ataca y otro defiende) y *Cabeza de la serpiente* (PV por cada personaje enemigo destruido). Gana quien tenga más PV tras la ronda 5.
**Mapas:** de ejemplo, aleatorio, *Ruinas urbanas*, *Llanura* y *Bosque* (los bosques se atraviesan, dan cobertura y tapan la visión si se cruzan más de 3"), todos simétricos.
**Condiciones:** *Noche* (nada dispara a más de 24") y *Tormenta* (−1 a impactar a más de 12").

## Ejércitos
Desde la versión 0.49 los perfiles, las armas y los puntos de cada unidad son los de su hoja **equivalente de la 11.ª edición de Warhammer 40.000** (sacados de la exportación de datos de Wahapedia del 23-11-2026). Los nombres y los textos de las habilidades son de *Mesa de Guerra*: cada habilidad está redactada con sus propias palabras, con el mismo efecto.

Listas de **1.000 puntos** (*Incursión*, por defecto) o **500** (*Escaramuza*): como mucho **2 unidades con el mismo nombre** (4 de **línea de batalla**); algunas cuestan más a partir de la 3.ª igual. Al menos un personaje. Cada escuadra puede llevar **un líder y un personaje de apoyo** (Médico o Portaestandarte). El **equipo opcional** se elige con casillas en Ejércitos (casi todo es gratis, como en la 11.ª) y cualquier unidad puede empezar **en reserva** (hasta la mitad de los puntos; los personajes, con su escuadra).

**Reglas de ejército:** la Legión activa una **doctrina de combate** en cada mando (devastadora, de asalto, táctica y otra vez devastadora: Fuerza de tarea Gladius). El Enjambre tiene **sinapsis** (a 6" de una miniatura sináptica: moral con 3D6 y +1 F en combate), los **instintos de enjambre** (Sostenida 1 contra infantería, Flota de invasión) y, una vez por partida en la ronda 2, la **Sombra en la disformidad** (toda la Legión chequea moral).

| Legión Astral | Equivale a (11.ª) | M | R | Sv | H | CO | Puntos | Armas | Habilidades |
|---|---|---|---|---|---|---|---|---|---|
| **Capitán** (personaje) | Captain | 6" | 5 | 3+/4++ | 5 | 1 | 1: 90 | Pistola bólter pesada, Bólter de maestro, Arma de energía de maestro | Hora gloriosa |
| **Tanque Martillo** | Predator Destructor | 10" | 10 | 3+ | 11 | 3 | 1: 140 (3.ª+: 150) | Autocañón de tanque, Cañones láser (×2), Orugas | Destructor, Dañado 4, Muerte explosiva D3 |
| **Guardia de Honor** | Bladeguard Veteran Squad | 6" | 5 | 3+/4++ | 3 | 1 | 3: 90 (3.ª+: 110) · 6: 180 (3.ª+: 200) | Pistola bólter pesada, Espada de energía de maestro | Guardia de la hoja |
| **Ingeniero de Combate** (personaje) | Techmarine | 6" | 5 | 2+ | 4 | 1 | 1: 55 | Bólter de forja, Pistola gravitatoria, Hacha y servobrazo | Bendición de la máquina |
| **Portaestandarte** (personaje, apoyo) | Ancient | 6" | 5 | 3+ | 4 | 2 | 1: 40 | Pistola bólter, Rifle bólter, Puños de ceramita | Honor de la compañía, Alzar el estandarte |
| **Saltadores de Asalto** | Assault Intercessors with Jump Packs | 12" | 5 | 3+ | 2 | 1 | 5: 95 (3.ª+: 105) · 10: 190 (3.ª+: 200) | Pistola bólter pesada, Espada sierra | Vuelo, Despliegue profundo, Martillo de ira |
| **Médico de Campaña** (personaje, apoyo) | Apothecary | 6" | 5 | 3+ | 4 | 1 | 1: 45 | Pistola absolvedora, Servoarmadura, Pistola reductora | Botiquín |
| **Francotiradores** | Eliminator Squad | 8" | 4 | 3+ | 2 | 1 | 3: 85 | Pistola bólter, Rifle de precisión, Puños de ceramita | Infiltrador, Sigilo, Ópticas de puntería |
| **Escuadra de Asalto Táctico** (línea de batalla) | Intercessor Squad | 6" | 5 | 3+ | 2 | 2 | 5: 85 · 10: 170 | Pistola bólter, Rifle bólter, Puños y cuchillo | Disciplina bólter |
| **Escuadra de Fuego Pesado** | Desolation Squad | 6" | 5 | 3+ | 2 | 1 | 5: 140 (3.ª+: 150) | Pistola bólter, Lanzadera de minas, Lanzacohetes de fragmentación, Puños de ceramita | Ópticas de puntería |
| **Andador de Combate** | Dreadnought | 6" | 9 | 2+ | 8 | 3 | 1: 135 | Cañón de asalto, Bólter de asalto, Puño de andador | Sabiduría de los antiguos, Muerte explosiva 1 |
| **Exterminadores** | Terminator Squad | 5" | 6 | 2+/4++ | 3 | 1 | 5: 190 (3.ª+: 230) · 10: 380 (3.ª+: 420) | Bólter de asalto, Puño de energía | Despliegue profundo, Furia de la Primera |
| **Psíquico de la Legión** (personaje) | Librarian | 6" | 5 | 3+ | 4 | 1 | 1: 75 | Pistola bólter, Golpe mental, Arma psíquica | Cúpula de fuerza |
| **Motoristas de Asalto** | Outrider Squad | 12" | 6 | 3+ | 4 | 2 | 3: 80 · 6: 160 | Pistola bólter pesada, Rifle bólter gemelo, Espada sierra | Asalto a todo gas |

| El Enjambre | Equivale a (11.ª) | M | R | Sv | H | CO | Puntos | Armas | Habilidades |
|---|---|---|---|---|---|---|---|---|---|
| **Acechadores** | Raveners | 10" | 5 | 4+ | 3 | 1 | 5: 125 (3.ª+: 135) | Garras de acechador | Túneles |
| **Mente del Enjambre** (personaje) | Tyranid Prime with Lash Whip | 10" | 5 | 3+ | 6 | 1 | 1: 75 | Garra desgarradora, Guadañas, Látigo | Sináptico, Guerrero alfa |
| **Carnífice** | Carnifexes | 8" | 9 | 2+ | 8 | 3 | 1: 90 · 2: 180 | Guadañas monstruosas, Guadañas de más | Muerte explosiva 1 |
| **Tirano Sináptico** (personaje) | Hive Tyrant | 8" | 10 | 2+/4++ | 10 | 3 | 1: 195 | Espada ósea y látigo, Guadañas monstruosas | Sináptico, Embate, Voluntad de la colmena, Muerte explosiva D3 |
| **Garras Menores** (línea de batalla) | Hormagaunts | 10" | 3 | 5+ | 1 | 2 | 10: 70 · 20: 120 | Garras | Salto feroz |
| **Escupidores** (línea de batalla) | Termagants | 6" | 3 | 5+ | 1 | 2 | 10: 55 · 20: 110 | Escupidor, Garras y dientes | — |
| **Aguijones** | Neurogaunts | 6" | 3 | 6+ | 1 | 1 | 11: 45 · 22: 90 | Garras y dientes | Neurocitos |
| **Acechador Oculto** | Lictor | 8" | 6 | 4+ | 6 | 1 | 1: 60 | Garras de acechador oculto | Golpea primero, Infiltrador, Sigilo, Operativo solitario, Tentáculos devoradores |
| **Bestia Guardiana** | Screamer-Killer | 8" | 9 | 2+ | 10 | 3 | 1: 125 (3.ª+: 135) | Grito bioplásmico, Garras de la bestia | Grito de muerte, Muerte explosiva 1 |
| **Devorador** | Haruspex | 8" | 11 | 3+ | 14 | 4 | 1: 125 (3.ª+: 135) | Lengua garfio, Fauces voraces, Garras excavadoras | Espectáculo horrendo, Muerte explosiva D3 |
| **Biomorteros** | Biovores | 5" | 6 | 3+ | 5 | 1 | 1: 60 · 2: 100 · 3: 140 | Lanzaesporas, Patas punzantes | Muerte explosiva 1 |
| **Reventadores** | Spore Mines | 4" | 1 | — | 1 | 0 | 3: 55 · 6: 110 | — | Muerte flotante, Vuelo, Despliegue profundo |
| **Gárgolas** (línea de batalla) | Gargoyles | 12" | 3 | 6+ | 1 | 2 | 10: 75 · 20: 150 | Escupidor, Veneno cegador | Vuelo, Despliegue profundo |
| **Guerreros Nodo** | Tyranid Warriors with Ranged Bio-weapons | 6" | 5 | 4+ | 3 | 2 | 3: 60 · 6: 120 | Devorador, Garras de guerrero | Sináptico, Depredadores adaptables |

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
