# Historial de versiones

Lo nuevo de cada versión de *Mesa de Guerra*, de la más reciente a la primera.

## 0.36 · fase 17, vida en la mesa (#94–#96)
- **Animaciones (#94):** las miniaturas dan pasitos y se balancean al moverse (también al deshacer y en la repetición). En combate, cada atacante embiste hacia su objetivo; quien recibe un impacto, de un disparo o cuerpo a cuerpo, retrocede con una sacudida en el momento en que le llega. Se apagan en Ajustes > *Animar las miniaturas*.
- **Iconos sobre las unidades (#95):** encima de cada unidad, lo que ha hecho este turno: ha movido, avanzado o se ha retirado, acaba de llegar de la reserva, ha disparado, cargado o combatido, ha usado su poder psíquico o tiene una estratagema. También si está desmoralizada. Crecen al alejar la cámara y no salen en la repetición. Leyenda en la ayuda (busca «iconos»); se apagan en Ajustes.
- **Orden interno (#96):** la sala (luces, noche y tormenta), los efectos de los ataques y el panel de ayuda salen del archivo principal a sus propios módulos, sin cambiar nada de lo que se ve.

## 0.35 · fase 16, códice y desafíos (#91–#93)
- **Códice (#91):** menú > *Códice*, o el botón *Códice* de la ficha. Cada unidad con su miniatura en 3D girando, perfil, armas (también las de equipo), habilidades, equipo opcional y un texto de trasfondo; y una entrada para cada bando.
- **Desafíos (#92):** cinco escenarios cortos, de 1 a 3 estrellas: *Último bastión* (aguanta tres rondas rodeado), *Decapitación* (mata al Tirano cuanto antes), *La marea* (con el Enjambre, toma la base de la Legión), *Cazabestias* (acaba con el Tirano y un Carnífice) y *El corazón* (conserva el centro). Se guarda la mejor marca; durante el desafío, un cartel recuerda el objetivo.
- **Logros (#93):** trece logros (ganar en Difícil, con los dos bandos, sin perder unidades, de noche, una campaña, 3 estrellas…), con aviso al conseguirlos y la lista en el Historial.

## 0.34 · fase 15, batallas grandes (#88–#90)
- **Tamaño de partida (#88):** *Escaramuza* (500 puntos) o *Batalla* (1.000), en la partida rápida, Ejércitos y la campaña. A 1.000 puntos, el doble de límites (6 unidades iguales, 2 Andadores o Tiranos); listas de prueba y al azar de 1.000. Todo cabe en las zonas de despliegue.
- **Rendimiento (#89):** medido en una batalla de 1.000 puntos (130 miniaturas): 333 llamadas de dibujo, 115.000 triángulos y el JavaScript ocioso el 95 % del tiempo, también arrastrando. La IA tarda como mucho 0,4 s en una fase. No hizo falta cambiar nada.
- **Misión Asalto (#90):** asimétrica. La semilla de la partida decide quién defiende; tres puestos justo delante de su zona. Al acabar cada turno, el atacante gana 4 PV por puesto que controle y el defensor, 1 por cada uno que conserve (hasta 3). El panel de misión dice quién ataca. IA Difícil contra IA Difícil, 90 partidas: atacante 40, defensor 47, 3 empates (el Enjambre ataca mejor; la Legión defiende mejor).

## 0.33 · equilibrio de los mapas
- **La IA rodea la escenografía sólida:** si un muro, contenedor o búnker corta el camino, prueba a pasar por cada esquina en dos tramos, sin salirse del movimiento.
- **Mapas con cobertura suficiente:** el generador pone un mínimo de escenografía que tapa la visión en cada mitad, y la coloca sobre todo hacia el centro. Con la IA Difícil en los dos bandos, el Enjambre pasa de perder casi siempre a quedar parejo (aleatorio 35-30, Ruinas urbanas 37-31). La Llanura sigue favoreciendo a la Legión (48-20), como corresponde a un mapa abierto. *Ruinas urbanas* ya no lleva contenedores.

## 0.32 · fase 14, campo de batalla (#84–#86)
- **Bosques (#84):** escenografía nueva (7" × 5") que se atraviesa y donde se puede acabar. Quien está dentro o detrás tiene cobertura; si la línea de visión cruza más de 3" de bosque (y ninguna de las dos miniaturas está dentro), no se ve. Modelo con una docena de árboles low poly.
- **Tipos de mapa (#85):** además de *Aleatorio*, *Ruinas urbanas* (densa, con búnker en el centro), *Llanura* (abierta) y *Bosque*. Todos simétricos respecto al centro. Con la IA Difícil en los dos bandos: Bosque queda parejo (22-23), y en Llanura y Ruinas urbanas gana más la Legión (unos 34-12). En la 0.33 se corrige (había poca escenografía que tapara la visión).
- **Ambiente sonoro (#86):** viento y, de vez en cuando, explosiones y ráfagas lejanas. Ajustes > *Ambiente* (apagado, bajo, medio, alto). Empieza con el primer clic.

## 0.31 · fase 13, revisión y orden (#80–#83)
- **Prueba de resistencia (#80):** 1.000 partidas IA contra IA con listas al azar (equipo, reservas, psíquicos), las cuatro misiones, condiciones, mapas aleatorios y niveles mezclados, comprobando cada estado; también que guardar, cargar y repetir dan la misma mesa. Encontró un fallo: *Oleada sin fin* podía dar a las Garras nuevas el mismo identificador que una miniatura en reserva. Arreglado.
- **Ayuda ordenada (#81):** secciones plegables y buscador en el panel de ayuda.
- **Listas al azar (#82):** botón *Al azar* en Ejércitos y opción en la partida rápida y en la campaña.
- **README en orden (#83):** guía de juego al día y tabla de unidades; el historial de versiones pasa a este archivo.

## 0.30 · fase 12, personalización y poderes (#77–#79)
- **Pinta tu ejército (#77):** en Ajustes, cuatro esquemas por bando. Legión: azul y oro, rojo y negro, verde y hueso o gris y blanco. Enjambre: morado, rojo carmesí, verde pantano u ocre. Cambian las miniaturas, las peanas y el color del bando en la interfaz (la página se recarga). Los colores para daltónicos mandan sobre los esquemas.
- **Poderes psíquicos (#78):** dos personajes nuevos.
  - **Psíquico de la Legión** (75 pts): M6 R4 Sv3+ Inv5+ H4; pistola bólter y báculo psíquico. Puede liderar una Escuadra de Asalto o los Exterminadores.
  - **Mente del Enjambre** (80 pts): M6 R5 Sv4+ Inv5+ H5; garras afiladas. Es sináptica.
  - Una vez por turno, en el disparo, usan su poder (*Rayo mental* / *Grito psíquico*) contra un enemigo visible a 18": **2D6 a 7 o más, D3 heridas mortales**. Con **doble 1 o doble 6**, el psíquico sufre 1 herida mortal. Sale en el menú de acciones al hacer clic en el enemigo, con su probabilidad; la IA lo usa.
- **Historial (#79):** botón *Historial* en el menú. Cada partida acabada contra la IA queda apuntada en el navegador: victorias, empates y derrotas por dificultad y por bando, y las diez últimas (con misión, condición y si era de campaña).

## 0.29 · fase 11, ayudas y accesibilidad (#73–#76)
- **Lección 2 del tutorial (#73):** al abrir el tutorial se elige lección. La 2 empieza en la ronda 2 con Exterminadores en reserva y enseña a traer reservas, pedir consejo (*Sugerir*), mirar la línea de visión y usar una estratagema (*Puntería*).
- **Colores para daltónicos (#74):** Ajustes > *Colores de bando: azul y naranja*. Cambia paneles, anillos, objetivos y las miniaturas del Enjambre (al cambiarlo la página se recarga; la partida se guarda sola).
- **Deshacer mi jugada (#75):** contra la IA, **Ctrl+Z** (o *Deshacer*) vuelve a antes de tu última acción, con todo lo que hizo la IA después. **Ctrl+Alt+Z** deshace una sola orden. Si al volver atrás sigue siendo el turno de la IA, se pausa.
- **Hoja de atajos (#76):** la tecla **?** enseña todos los atajos de teclado.

## 0.28 · fase 10, campaña (#70–#72)
- **Campaña de tres batallas (#70):** botón *Campaña* en el menú. Eliges bando, dificultad y listas, y juegas seguidas:
  1. *Cabeza de playa* (Toma y mantén);
  2. *La reliquia en la oscuridad* (Reliquia, de noche);
  3. *Cacería bajo la tormenta* (Caza de presas, con tormenta).

  Cada una en un mapa aleatorio simétrico. Al acabar cada batalla, *Seguir la campaña* apunta el resultado; gana quien gane más batallas (si empatan, más PV en total). Se guarda en el navegador y el menú enseña por dónde vas.
- **Veteranía (#71):** entre batallas, las unidades que sobreviven y han hecho daño pasan a **Veteranas** (en los dos bandos): repiten los 1 al herir y llevan un anillo dorado con galones en la peana. Las destruidas vuelven con reclutas, sin veteranía.
- **Pantalla táctil (#72):** un dedo selecciona y arrastra como el ratón; dos dedos pellizcan para acercar, giran para rotar la vista y se mueven juntos para desplazarla. Tocar un enemigo abre el menú de acciones y dibuja la línea de visión.

## 0.27 · fase 9, pulido (#66–#69)
- **El equipo cuenta en las bajas (#66):** los puntos destruidos (estadísticas, *Caza de presas*) y la regla de la mitad en reserva incluyen el coste del equipo opcional.
- **Modo espectador (#67):** en la partida rápida, *Tu ejército: Ninguno*. La IA despliega y juega los dos bandos (combates alternos y fuego defensivo incluidos) y la cámara sigue la acción. *Pausar IA* la detiene; *Dejar de mirar* te devuelve la mesa con la IA llevando su bando, en pausa.
- **Condiciones de batalla (#68):** en la partida rápida o en Ejércitos.
  - **Noche:** ningún arma dispara a más de 24". La sala se oscurece y se vuelve azulada.
  - **Tormenta:** −1 a impactar al disparar a más de 12" (no en el fuego defensivo). Sala gris, relámpagos y truenos.
  - La IA cuenta con ellas. Con la IA Difícil en los dos bandos, la Noche favorece algo al Enjambre en el mapa de ejemplo (24-33) y queda pareja en mapas aleatorios (22-22); con 18" el Enjambre ganaba 50 de 60, por eso son 24".
- **Tamaño de la interfaz (#69):** en Ajustes, del 85 % al 130 % (la mesa en 3D no cambia). El panel de turno ya no se mete debajo de los dados: sus botones bajan a otra línea.

## 0.26 · fase 8, variedad (#63–#65)
- **Equipo opcional (#63):** casillas en Ejércitos, con su coste.
  - Escuadra de Asalto: el sargento puede llevar espada de energía (+10) o pistola de plasma (+5); un legionario, lanzallamas (+5) y otro, lanzamisiles (+10).
  - Fuego Pesado: todos con lanzamisiles (0) o cañón láser (+10; 48", F12, FP−3, D6 de daño).
  - Escupidores: ácido corrosivo (0; 12", 2 ataques, FP−1). Garras Menores: púas venenosas (Letal, +1 pt por miniatura).
  - La ficha de la unidad enseña las armas que llevan de verdad y cuántas miniaturas llevan cada una. Con la IA Difícil en los dos bandos, el equipo no desequilibra.
- **Misión Reliquia (#64):** una reliquia en el centro (si cae en el búnker, se aparta por la línea central). La recoge la unidad que acabe a 1" sin enemigos tan cerca (las bestias y vehículos grandes no pueden), va con ella y cae donde estaba si la destruyen. Al acabar tu turno, desde la ronda 2: 6 PV si la llevas y 2 por cada flanco. La IA va a por ella y persigue al portador. En la mesa, cristal dorado; al llevarla, flota sobre el portador con el color de su bando.
- **Estadísticas de la batalla (#65):** el resumen final trae una tabla por bando (heridas causadas, miniaturas eliminadas, puntos destruidos y estado de cada unidad) y la **unidad de la partida**, la que más puntos ha destruido.

## 0.25 · fase 7, profundidad y ayudas (#59–#62)
- **Sugerir jugada (#59):** botón **Sugerir** en el panel de turno, o tecla **H**: enseña lo que haría la IA Difícil ahora (en dorado: la unidad, adónde movería, a quién dispararía o cargaría) y lo explica en una frase. No hace nada: la mesa y los dados no cambian.
- **Línea de visión (#60):** en el disparo, con tu unidad elegida y el ratón sobre un enemigo, cada miniatura traza su línea a la miniatura enemiga que mejor ve: **verde** la ve, **naranja** con cobertura, **roja** no ve a ninguna, **gris discontinua** la ve pero no llega.
- **Repetición (#61):** al acabar, **Ver repetición** vuelve a jugar la batalla desde el despliegue, con disparos y dados animados. Pausa (*Espacio*), paso a paso, barra para saltar, velocidad de 0,5× a 4× (a 4× sin esperar animaciones) y *Esc* para salir. La partida no cambia.
- **Unidades nuevas (#62):**
  - **Motoristas de Asalto** (Legión, 3 por 110 o 6 por 220 pts): M12 R5 Sv3+ H2 CO1; bólter gemelo (18", A3, F4, FP−1) y cuchillo. *Turbo*: al avanzar suman 6" sin tirar.
  - **Carnífice** (Enjambre, 1 por 190 pts): M8 R9 Sv2+ H10 CO3; lanzapinchos (24", D6 ataques, F6, FP−1, Explosiva) y guadañas monstruosas (A5, F9, FP−2, D3). *Aterrador*: los enemigos a 6" o menos chequean moral con −1 al Liderazgo. No cuenta para el límite de un Andador o Tirano.
  - Puntos ajustados con partidas IA Difícil contra IA Difícil: 6 Motoristas contra el Carnífice quedan parejos.
- **Arreglo:** la peana de los Exterminadores tenía el borde del color del Enjambre.

## 0.24 · fase 6, acabado (#54–#58)
- **Pantalla de inicio (#54):** al abrir el juego, *Jugar contra la IA* (bando, dificultad, misión y mapa en un paso), *Continuar la partida*, *Tutorial*, *Mesa libre*, *Ejércitos*, *En línea* y *Ajustes*. Se vuelve con **Menú**; se puede desactivar.
- **Ajustes en un solo sitio (#55):** sonido y volumen, rejilla, gráficos, velocidad de los ataques, si la cámara sigue a la IA, el aviso al pasar de fase con cosas pendientes, los anillos de ayuda y las probabilidades al pasar el ratón. Se recuerdan en el navegador.
- **Reservas (#56):** las unidades con *Despliegue profundo* (Legión) o *Túneles* (Enjambre) pueden empezar fuera de la mesa: casilla *En reserva* en Ejércitos, como mucho la mitad de los puntos. Desde la **ronda 2**, en tu movimiento, el panel de turno muestra **Llegar**: clic y luego clic en la mesa; en rojo las zonas prohibidas (9" de cualquier enemigo) y en verde dónde caerían las miniaturas. Llegar cuenta como su movimiento (disparan y cargan con normalidad). **Lo que no haya llegado al acabar la ronda 3 se pierde** (en *Caza de presas* da PV al rival); en la ronda 3 cuentan como pendientes y *Tab* las trae.
- **Unidades nuevas (#57):**
  - **Exterminadores** (Legión, 5 por 200 pts): M5 R5 Sv2+ Inv4+ H3; bólter de asalto (24", A2, Ráfaga 2) y puño de energía (A3, F8, FP−2, D2). Despliegue profundo.
  - **Acechadores** (Enjambre, 3 por 75 o 6 por 150 pts): M8 R5 Sv4+ H3; cuchillas dobles (A5, F6, FP−2, Sostenida 1). Túneles.
  - La IA trae sus reservas buscando el mejor sitio (cerca de objetivos que no controla y de presas al alcance de sus armas o de una carga).
- **Rendimiento (#58):** cada miniatura y pieza de escenografía es ahora **una sola malla** con color por vértice (antes una por color): de unas 1.400 llamadas de dibujo a unas 380 con 128 miniaturas en la mesa, y la décima parte de objetos que hacen sombra. El **mapa de sombras solo se repinta cuando algo se mueve**. Nuevo ajuste **Gráficos: Rápidos** (sin sombras y a resolución 1×) para equipos modestos.

## 0.23 · miniaturas sueltas y hitboxes de la escenografía
- **Mover miniaturas sueltas en modo reglas:** el primer clic elige la unidad entera; **otro clic en una de sus miniaturas** deja solo esa, y se arrastra sola (con su límite de movimiento, los anillos y el aviso de coherencia). Arrastrar una miniatura ya elegida mueve lo que esté elegido (la unidad o esa sola). Sigue valiendo **Alt+clic**. La ficha de la unidad lo explica.
- **Hitboxes de la escenografía a la medida de los modelos:** lo que no se pisa ni se cruza son ahora las partes sólidas de verdad, medidas sobre cada modelo: los **muros** de las ruinas (se puede entrar por los lados abiertos y quedarse dentro, a cubierto), cada **contenedor** y las cajas sueltas, el **cuerpo del búnker** y la **barricada** (se cruza, pero no se acaba encima). El cráter no tiene: se entra. Antes contaba el rectángulo entero de la pieza (y las ruinas no frenaban nada).
- **Se ven:** al arrastrar miniaturas en modo reglas, o con *Escenografía* abierto, las partes sólidas se dibujan en rojo sobre la mesa, también a través de los muros.
- La visión no cambia: una ruina sigue ocultando lo que hay detrás de su huella, salvo para quien está dentro.
- Equilibrio con la IA Difícil desplegando los dos bandos, 90 partidas en el mapa de ejemplo: Legión 48, Enjambre 36, 6 empates (antes 43-43).

## 0.22 · jugabilidad y facilidad de uso (#46–#53)
- **Actuar sobre el tablero (#46):** con una unidad tuya elegida, al pasar el ratón por un enemigo aparecen las heridas y bajas esperadas (o la probabilidad de llegar en una carga, con y sin Ímpetu). Con **clic en el enemigo** sale un menú con todo lo que puedes hacer: cada arma, Granadas, cargar o combatir; lo que no se puede, con el motivo. Los enemigos a los que puedes hacer algo llevan un anillo naranja suave.
- **Qué puedo hacer ahora (#47):** las unidades que aún pueden actuar en la fase llevan un anillo verde que late, y bajo el panel del turno se lee lo que queda («Pueden disparar: …»). **Tab** elige la siguiente y la centra. Al pasar de fase con algo pendiente, avisa; una segunda pulsación pasa igualmente.
- **Tutorial (#48):** botón en el panel de ayuda. Una partida corta contra la IA Fácil, paso a paso: cámara, despliegue, mando, elegir y mover, disparar con los dados, cargar y combatir, el turno de la IA y los puntos de victoria. Cada paso avanza solo cuando lo haces.
- **Escenografía que estorba (#49):** contenedores y búnker no se pueden atravesar ni ocupar, y en una barricada no se puede acabar el movimiento. Para rodear, se arrastra en dos tramos. Las cargas, el agruparse y el consolidar tampoco acaban encima. La IA busca rodeos.
- **Fuego defensivo (#50):** cuando te cargan, puedes gastar 1 PM para que la unidad cargada dispare con todo lo que llegue, impactando solo con 6 (Torrente impacta igual). Una vez por turno. La carga espera a que decidas; la IA Difícil lo usa cuando compensa.
- **Despliegue de la IA y mapas (#51):** la IA recoloca su ejército al empezar (la pesada, o una de disparo, guarda el objetivo de su base; las de disparo buscan ruinas). En *Ejércitos* se elige el **mapa**: la mesa actual, el de ejemplo o uno **aleatorio simétrico** (sin sólidos en las zonas de despliegue ni encima de los objetivos). Las Garras Menores bajan de precio (10: 55 pts; 20: 110 pts) y la lista de prueba del Enjambre gana 10 Garras (485 pts).
- **Estratagemas de facción (#52):** **Granadas** (Legión, disparo): 6D6 a 4+ contra un enemigo visible a 8", cada éxito una herida mortal sin salvación; se elige el objetivo en la mesa. **Oleada sin fin** (Enjambre, mando): unas Garras en sinapsis recuperan D3+1 miniaturas.
- **Sensación de juego (#53):** trazadoras, ácido y chispas en cada ataque, destellos en los impactos; sonidos sintetizados (disparos, ácido, golpes, dados, cargas, turno, PV), con botón **Sonido** para silenciar; la cámara sigue a la IA; **velocidad de los ataques** (normal, rápida o al instante) en el panel de dados; y **Registro** de la batalla (botón o **L**) con cada disparo, carga, combate, moral, estratagema y PV, por rondas.
- **Equilibrio:** con la IA Difícil desplegando los dos bandos, 90 partidas en el mapa de ejemplo: Legión 43, Enjambre 43, 4 empates (en mapas aleatorios, con más ruinas, la Legión gana unas dos de cada tres). Difícil gana a Normal 46-20 y Normal a Fácil 54-8.
- **Pruebas:** 99 en total (acciones y guía, fuego defensivo, escenografía, mapas, despliegue de la IA, estratagemas de facción; las partidas completas comprueban que nadie acaba encima de escenografía).

## 0.21 · fase 5 (en línea, #40–#45) — fase 5 completa
- **Dos ordenadores, una mesa:** botón **En línea**. Uno crea la sala (elige su bando) y el otro se une. Solo viajan las órdenes, nunca el estado: como todo es determinista (la semilla de los dados va en la partida), los dos llegan a la misma mesa.
- **Órdenes por la red (#40):** el anfitrión es la autoridad. El invitado le pide cada orden; el anfitrión comprueba que puede hacerla, la aplica y la reenvía numerada a los dos. Permisos en modo reglas:
    - cada uno solo mueve, despliega y da órdenes a su ejército, y solo en su turno (en combate, cada uno golpea con lo suyo cuando le toca);
    - preparar la partida (misión, Desplegar, modo reglas, cargar o empezar mesa, escenografía) es cosa del anfitrión;
    - cada uno solo deshace y rehace lo suyo. En mesa libre todo vale, como en una mesa de verdad.
- **Tres maneras de conectar (#41):**
    - **Por internet, con código de sala** de 5 letras: WebRTC con el servidor gratuito de PeerJS, que solo os presenta; la partida va directa entre los dos navegadores.
    - **Manual (copiar y pegar):** el anfitrión manda un texto (unos 500 caracteres, por mensaje o correo) y el invitado contesta con otro. Sin ningún servidor, solo STUN público para atravesar el router.
    - **En este ordenador:** dos pestañas del mismo navegador, para probar o jugar en la misma pantalla.
- **La sala (#42):** el diálogo muestra con quién estás conectado, qué bando llevas y qué toca después. El invitado prepara su lista en *Ejércitos* y la envía («Enviar mi lista a la sala»); al anfitrión le aparece en la columna del rival y despliega con la misión que elija. La IA se desactiva en línea. Si se corta, el anfitrión sigue esperando con el mismo código y el invitado pulsa **Reconectar** (o se une otra vez): recibe la partida entera tal como va. El invitado no sobrescribe su mesa guardada.
- **Sin desincronizarse (#43):** con cada orden viaja la huella del estado del anfitrión. Si la del invitado no coincide, o falta una orden en la numeración, pide la partida entera y se arregla solo. Los mensajes grandes (la partida entera) se trocean.
- **Chat (#44):** abajo a la izquierda, con avisos (conexión, lista recibida, de quién es el turno). La pastilla del panel del turno dice si estás en línea, tu bando y el ping.
- **Pruebas (#45):** 89 en total. En Node, la Legión jugada desde un bus y el Enjambre desde otro acaban con la misma mesa, sin resincronizar; también los permisos, el deshacer, la desincronización provocada, un mensaje perdido y los troceos. En el navegador, dos pestañas y dos navegadores con WebRTC real (conexión manual) juegan una partida entera con la IA moviendo cada bando: la misma mesa al final y ninguna resincronización. La conexión con código no se ha podido probar aquí (sin salida a internet): sin servidor, avisa y propone la manual.

## 0.20 · fase 4 (IA y misiones, #33–#39) — fase 4 completa
- **Objetivos (#33):** marcadores de 40 mm con un faro. Los controla el bando que sume más CO con miniaturas a 3" o menos (borde con borde; las desmoralizadas cuentan 0; empate, nadie). El cristal y el anillo de 3" toman el color de quien lo controla.
- **Tres misiones (#34):** se eligen en *Ejércitos* (y valen también para *Partida de prueba*):
    - **Toma y mantén:** cinco objetivos (una base en cada zona, dos flancos y el búnker del centro). Al empezar tu turno, desde la ronda 2: 5 PV por objetivo, hasta 15.
    - **Corazón del frente:** tres objetivos en la línea central; el búnker vale el doble. Al empezar tu turno: 4 PV por flanco y 8 por el Corazón.
    - **Caza de presas:** cuentan las bajas: 1 PV por cada 20 puntos de miniaturas enemigas eliminadas. Además, cuatro objetivos de 2 PV al acabar tu turno (hasta 4).
- **Puntos de victoria y fin de partida (#35):** panel de misión arriba a la derecha con los PV, cada objetivo con el CO de cada bando y lo que vale ahora. PV también en el panel del turno. Tras la ronda 5, resumen: quién gana, PV por ronda, puntos perdidos y unidades destruidas por cada bando.
- **Estratagemas (#36):** en tu turno, con 1 PM, desde la ficha de la unidad. Cada una, una vez por turno y nunca sobre una unidad desmoralizada (salvo Reagrupar):
    - **Reagrupar** (mando): la unidad deja de estar desmoralizada.
    - **Puntería** (disparo): +1 para herir.
    - **Ímpetu** (carga): si la carga falla, se repite la tirada.
    - **Furia** (combate): +1 para impactar.
- **IA táctica (#37):** juega cada fase con las mismas órdenes que un jugador:
    - Mueve cada unidad al destino de más valor entre varios (quedarse, cada objetivo, hacia cada enemigo, alejarse; con o sin avanzar): objetivos que gana o asegura, disparos y cargas que tendrá a tiro y el daño que puede recibir (cuerpo a cuerpo y disparos, con la cobertura).
    - Dispara el arma y al objetivo con más puntos esperados (heridas × puntos por herida, más si acaba con la unidad o está en un objetivo), recalculando tras cada disparo.
    - Carga según la probabilidad de llegar y lo que gana y pierde en el combate, sin dejar un objetivo que solo ella sujeta. Usa estratagemas cuando compensan.
    - Tres niveles: **Fácil** (el bot de la fase 2, no mira los objetivos), **Normal** (valora peor los objetivos, se equivoca más y no usa estratagemas) y **Difícil**.
- **Jugar contra la IA (#38):** en *Ejércitos*, *Rival* elige qué bando lleva la IA (por defecto el Enjambre, en Normal). La IA despliega como sale la lista, juega sus fases sola paso a paso (con los dados a la vista y un aviso de lo que hace) y, en combate, golpea con sus unidades cuando le toca, también en tu turno. No se pueden mover ni dar órdenes a sus unidades; **Pausar IA** deja llevarlas a mano. Sin IA, el botón **IA** juega la fase en curso por el bando activo.
- **Equilibrio (#39):** con partidas IA contra IA:
    - Garras Menores pasan a R4 y Escupidores a Sv 4+; los flancos de Toma y mantén se acercan a cada bando (z ±5) y las misiones de objetivos puntúan al empezar el turno, para premiar aguantar.
    - Difícil contra Difícil, 120 partidas: Legión 51, Enjambre 53, 16 empates. Por misión el carácter se nota: Toma y mantén favorece al Enjambre (rápido y con muchas miniaturas), Caza de presas a la Legión (gana el intercambio de bajas) y Corazón del frente queda parejo.
    - Niveles: Difícil gana a Fácil 20-1 y a Normal 21-12 (prueba automática); Normal gana a Fácil casi nueve de cada diez.
- **Pruebas:** 81 en total (IA: cuentas, papeles, reparto de objetivos, partidas completas en las tres misiones sin solapes ni miniaturas fuera de la mesa y reproducibles; misiones y estratagemas).

## 0.19 · fase 3 (líderes unidos a escuadras, #32) — fase 3 completa
- **Lidera a:** en el editor de *Ejércitos*, el Capitán tiene un desplegable para unirse a una Escuadra de Asalto Táctico o de Fuego Pesado de la misma lista (una escuadra admite un solo líder). La lista de prueba lo une a la escuadra de Asalto de 10.
- **Despliegue juntos:** el líder sale pegado a su escuadra, en coherencia con ella.
- **Una sola formación:** al hacer clic en el líder o en la escuadra se seleccionan los dos (Alt + clic sigue cogiendo una sola miniatura). Se mueven juntos con el movimiento que se declare para cualquiera de ellos, a la M más baja de los dos (con Fuego Pesado, 5"), y la coherencia se mide con todas sus miniaturas.
- **Cargan juntos:** una sola tirada de 2D6 para la formación; los dos quedan como unidades que han cargado y combaten primero. En combate cada unidad golpea con sus propias armas.
- **Protegido:** no se puede disparar al líder mientras quede alguna miniatura de su escuadra (el objetivo aparece como «Protegido por su escuadra»). Si la escuadra cae, el líder sigue solo; si cae el líder, la escuadra pierde la ventaja.
- **Al mando:** mientras van juntos, la escuadra y el líder repiten los 1 al impactar, al disparar y en combate. El panel de la selección muestra las dos fichas con la etiqueta «Lidera…» / «Con Capitán · repite 1 al impactar».
- **Bot:** mueve al líder con su escuadra y no carga con la formación si lleva armas pesadas.
- **Pruebas:** 64 en total (6 nuevas de líderes y 5 de despliegue). En 40 partidas bot contra bot: Legión 26, Enjambre 8, empates 6.

## 0.18 · fase 3 (fase de despliegue, #31)
- **Despliegue antes de la ronda 1:** al desplegar listas (*Ejércitos* o *Partida de prueba*) la partida empieza en la fase **Despliegue**: ronda 1, 1 PM por bando y registros de combate y moral vacíos.
- **Recolocar:** en esta fase los dos bandos pueden arrastrar y girar sus miniaturas, pero solo dentro de su zona (la franja de su color): al arrastrar no pasan del borde de la zona y, al soltar, cada peana va al hueco libre más cercano dentro de ella. Lo que no cabe vuelve a su sitio.
- **Empezar partida:** el botón del panel del turno pasa al mando de la ronda 1 (también *Bot* y, en mesa libre, *Pasar turno*). Se puede deshacer.

## 0.17 · fase 3 (editor de listas de ejército, #30)
- **Ejércitos:** el botón *Ejércitos* abre un editor con una lista por bando. Se añaden unidades de las hojas de datos de ese bando (el desplegable dice los tamaños y su coste), se elige el número de miniaturas y se quitan con ×.
- **Puntos y validación al momento:** total sobre 500 (en rojo si se pasa) y los fallos del reglamento: tamaños válidos, como mucho 3 unidades iguales, 1 Andador o Tirano y al menos un personaje.
- **Listas guardadas:** cada bando guarda y carga listas con nombre en el navegador (hasta 20 por bando); *Vaciar* empieza de cero.
- **Desplegar:** con las dos listas válidas, *Desplegar* sustituye las miniaturas de la mesa por las listas en sus zonas (se puede deshacer) y activa el modo reglas. Por defecto vienen las dos listas de la partida de prueba.
- El panel del turno ya no parte en dos líneas el texto ni los botones.

## 0.16 · fase 3 (modelos de todas las unidades, #26–#29)
- **Capitán** (peana de 40 mm): cabeza descubierta con laurel dorado, capa roja, espada de energía luminosa en alto y pistola de plasma.
- **Escuadra de Fuego Pesado:** legionarios con casco oscuro, cañón pesado a la cadera con tambor de munición, cinta desde la mochila y cinturón de cargadores.
- **Andador de Combate** (peana de 90 mm): sarcófago con placa dorada y águila, piernas de pistón, cabeza blindada con visor, chimeneas, cañón de asalto rotativo de tres cañones y puño de combate con dedos y bobina de energía. Tres poses.
- **Tirano Sináptico** (peana de 60 mm): dos veces y media el tamaño de una Garra, con guadañas, cañón bio, corona sináptica luminosa, espinas de hueso en el lomo y cola larga.
- **Guerreros Nodo** (40 mm): Garras grandes con cañón bio y corona sináptica.
- **Escupidores** (25 mm): criaturas sin guadañas que sujetan un tubo escupidor con un canal luminoso.
- **Corregido:** al desplegar listas nuevas, las miniaturas que reutilizaban un id (L1, E1…) conservaban el modelo anterior. Ahora el modelo se rehace si cambia el tipo, la pose o el rango.

## 0.15 · fase 2 (partida de prueba completa, #25) — fase 2 completa
- **Partida de prueba:** en *Mesas*, el botón *Partida de prueba* despliega dos ejércitos (Legión: Capitán, Asalto Táctico de 10 y de 5, Fuego Pesado — 460 pts; Enjambre: Tirano Sináptico, Guerreros Nodo, Garras Menores de 20, Escupidores de 10 — 450 pts) en sus zonas y activa el modo reglas. Se puede deshacer.
- **Bot:** en modo reglas, el botón *Bot* juega la fase en curso por el bando activo (mover, disparar, cargar y combatir) con las mismas órdenes que un jugador. Sirve para jugar en solitario contra él o para ver una partida entera.
- **Listas y despliegue (base para la fase 3):** `rules/armies.ts` valida listas (tamaños, máx. 3 iguales, 1 grande, un personaje, 500 pts) y la orden `setArmies` las despliega en bloques coherentes en cada zona.
- **Corregido (lo encontró la partida simulada):** al soltar una unidad cerca del límite de movimiento, el recorte al límite podía dejar dos peanas una encima de otra. Ahora la colocación se resuelve de una vez con todas las condiciones (sin solapes, fuera del trabamiento enemigo y dentro de la asignación): cada miniatura va al sitio legal más cercano y, si no hay ninguno, se queda donde estaba.
- **Pruebas:** partidas completas de 5 rondas bot contra bot con 6 semillas, comprobando en cada fase que no hay solapes, que todo está en la mesa y que las unidades cuadran, y que rehacer el registro da exactamente el mismo estado. 53 pruebas en total.
- **Prueba de diversión (datos):** en 40 partidas bot contra bot, la Legión gana 26, el Enjambre 7 y hay 7 empates (≈42 ataques, 12 cargas y 0,7 unidades desmoralizadas por partida). El Enjambre sale flojo: hay que jugar unas partidas a mano antes de tocar los números.
- Los modelos del Capitán, Fuego Pesado, Andador, Tirano, Guerreros Nodo y Escupidores son provisionales (llegan en la fase 3).

## 0.14 · fase 2 (panel de unidad, #24)
- **Hoja de datos en pantalla:** al seleccionar una unidad (de cualquier bando, en mesa libre o en modo reglas) aparece su ficha: nombre en el color del bando, miniaturas vivas, coste en puntos, etiquetas de estado y sus atributos en una rejilla (M, R, Sv, Inv, H, L, CO).
- Debajo, la **tabla de armas** (alcance, A, HP, F, FP, D y habilidades; las del sargento marcadas), las **habilidades de la unidad** explicadas, las **heridas** de cada miniatura dañada y, en modo reglas, **lo que ha hecho este turno** (movió/avanzó/se retiró, disparó, cargó, combatió, trabada).
- Los botones de la fase en curso (mover, disparar, cargar, combatir) siguen arriba; *Ocultar hoja* pliega el detalle.

## 0.13 · fase 2 (moral y sinapsis, #23)
- **Chequeos de moral automáticos:** al empezar la fase de mando de un bando (en modo reglas), cada unidad suya por debajo de la mitad (de miniaturas, o de heridas si es de una sola) tira 2D6 contra su L con los dados de la semilla. Un informe enseña cada chequeo.
- **Desmoralizada:** si falla, queda desmoralizada hasta su siguiente fase de mando: CO 0 y sin PM. Se marca con un anillo rojo oscuro en la mesa y una etiqueta en su ficha.
- **Sinapsis:** las unidades del Enjambre a 12" de una unidad Sináptica (Tirano Sináptico, Guerreros Nodo) superan el chequeo sin tirar; su ficha dice «En sinapsis».
- La ficha marca también «Por debajo de la mitad».
- **Retirar a mano (mesa libre):** Supr retira las miniaturas seleccionadas (se puede deshacer). En modo reglas las bajas solo las causan los ataques.
- Código: `rules/morale.ts`, con 4 pruebas nuevas (48 en total).

## 0.12 · fase 2 (carga y combate, #22)
- **Carga:** en la fase de carga, la ficha de la unidad ofrece *Cargar a…* cada unidad enemiga a 12" o menos, con la distancia y la tirada necesaria en 2D6. Los dados salen de la semilla y ruedan en la bandeja. Si el resultado alcanza para quedar a 1", cada miniatura avanza sola hasta el contacto de peana con la enemiga más cercana (sin solapes); si no, no se mueve. Un aviso dice la tirada y el resultado.
- **Restricciones de carga:** una por unidad y turno; no si ya está trabada; no tras retirarse; no tras avanzar (salvo Rapidez, que tienen las Garras Menores).
- **Combate:** cualquier unidad trabada (de los dos bandos) puede *Combatir contra…* una enemiga con la que esté trabada, una vez por fase. Primero deben combatir las unidades que cargaron con éxito; la ficha lo indica.
- **Cómo se resuelve:** la unidad se agrupa 3" hacia el enemigo, golpean las miniaturas trabadas y las de segunda fila (a ½" de una amiga trabada), cada grupo con su arma cuerpo a cuerpo (el sargento con la espada sierra, el resto con el cuchillo), y después consolida 3". El informe reproduce cada arma seguida, con sus dados.
- La cola del informe cuenta bien las supervivientes tras cada arma; el registro de ataques ya no se recorta.
- Código: `rules/melee.ts` (carga, agruparse, consolidar, quién golpea y orden de combate) y `performAttack`, compartido con el disparo. 5 pruebas nuevas (44 en total).

## 0.11 · fase 2 (fase de disparo, #21)
- **Disparar:** en la fase de disparo, la ficha de la unidad lista sus armas a distancia con su perfil (24" A2 3+ F4 FP−1 D1…) y, para cada una, un botón por unidad enemiga con la distancia, si está en cobertura y cuántas miniaturas llegan. Al pasar el ratón por el botón, la unidad objetivo se marca en naranja.
- **Quién dispara:** solo las miniaturas que llevan el arma, ven alguna miniatura objetivo (ruinas, contenedores y búnker tapan) y la tienen al alcance. El sargento dispara su pistola por separado.
- **Restricciones:** cada arma dispara una vez por fase; tras avanzar solo armas de Asalto; tras retirarse, nada; una unidad trabada solo dispara pistolas a quien la traba; no se puede disparar a una unidad trabada con las tuyas. Cada botón deshabilitado dice por qué.
- **Resolución:** la orden `shoot` resuelve impactar → herir → salvar → daño con los dados de la semilla, dentro del estado: se puede deshacer y rehacer y sale siempre igual. Cobertura si ninguna miniatura tiradora ve el objetivo sin escenografía de por medio; el daño va primero a las heridas y luego a las más cercanas.
- **Paso a paso:** un informe arriba enseña cada tirada (impactar, herir, salvar) con sus dados en fichas (verdes los éxitos) mientras ruedan en la bandeja; *Ver bandeja* lleva la cámara allí y *Saltar* va al final. Las bajas se quedan en la mesa hasta las salvaciones y luego caen.
- Código: `rules/shooting.ts` (opciones, alcance, visión, cobertura y resolución), `view/shotPlayer.ts` (reproducción) y el registro de ataques `combatLog` en el estado. 6 pruebas nuevas (39 en total).

## 0.10 · fase 2 (fase de movimiento, #20)
- **Unidad entera:** en modo reglas, un clic selecciona toda la unidad y aparece su ficha (atributos y miniaturas vivas). **Alt+clic** selecciona una sola miniatura para recolocarla dentro de la formación.
- **Fase de movimiento:** la unidad elige en su ficha **Mover** (hasta M), **Avanzar** (M + D6; el dado sale de la semilla, se ve en la bandeja y se puede deshacer) o **Retirarse** (solo si está trabada). Arrastrarla sin elegir es un movimiento normal.
- **Límites:** cada miniatura puede alejarse como mucho su asignación desde donde empezó la fase, aunque se arrastre varias veces. Mientras se arrastra, la etiqueta dice «4,2" de 6"» y la miniatura no pasa del límite. Unos círculos azules marcan hasta dónde llega cada una.
- **Trabada:** una unidad a 1" de un enemigo solo puede retirarse o quedarse quieta. Ninguna miniatura puede acabar un movimiento a 1" de un enemigo: si se suelta ahí, vuelve a su sitio y se avisa.
- **Fuera de turno:** en modo reglas no se pueden mover las miniaturas del otro bando ni mover nada fuera de la fase de movimiento (la Mesa libre sigue permitiéndolo todo).
- Se apunta cómo movió cada unidad (avanzar o retirarse) para las restricciones de disparo y carga que llegan en las siguientes fases.
- Simplificación de esta versión: se mide en línea recta desde el origen; todavía no se comprueba el camino (atravesar enemigos o escenografía).
- Código: `rules/movement.ts` (asignaciones, recorte, trabamiento y restricciones) y `input/rulesGate.ts` (lo que el modo reglas permite a la mano), con 7 pruebas nuevas (33 en total).

## 0.9 · fase 2 (visión, coherencia y fases del turno, #18 y #19)
- **Modo reglas** (botón *Mesa libre* / *Modo reglas*): el panel del turno muestra las cinco fases (Mando, Movimiento, Disparo, Carga, Combate) con la actual resaltada, los PM de cada bando y una línea que explica qué se hace en esa fase. **Intro** o *Siguiente fase* avanza; tras el combate pasa al otro bando. Cada fase de mando da 1 PM a los dos. Tras la ronda 5 la partida termina.
- En **mesa libre** todo sigue como antes: *Pasar turno* y sin límite de rondas. Las fases aún no limitan nada; eso llega con las fases de movimiento, disparo y combate.
- **Visión en la cinta:** al medir de una miniatura a otra enemiga, la etiqueta dice *visible*, *en cobertura* o *sin visión*. Ruinas, contenedores y búnker tapan la vista (salvo estando dentro); cráteres y barricadas no la tapan, pero dan cobertura. Se comprueban tres líneas por pareja (centro y bordes): si alguna pasa, hay visión; si alguna cruza escenografía, hay cobertura.
- **Coherencia:** al seleccionar una miniatura, las de su unidad que están a más de 2" de las demás (de dos, con 6 o más miniaturas) se marcan en rojo y el panel de selección lo avisa.
- Código: `rules/geometry.ts` (coherencia, trabamiento a 1", huellas de escenografía, visión y cobertura) y `rules/turn.ts` (fases, PM y rondas), con 9 pruebas nuevas (26 en total). Órdenes nuevas: `nextPhase`, `setRulesMode` y `spendCP`.

## 0.8 · fase 2 (hojas de datos y secuencia de ataque, #16 y #17)
- **Reglamento v0.1** en la pestaña *Reglamento* del documento del proyecto: atributos M, R, Sv, Inv, H, L y CO; armas con alcance, A, HP, F, FP y D; habilidades de arma; turno de cinco fases; moral y sinapsis; ejércitos de 500 puntos.
- **Hojas de datos en el código** (`rules/datasheets.ts`): las 8 unidades (Capitán, Escuadra de Asalto Táctico, Escuadra de Fuego Pesado, Andador de Combate, Tirano Sináptico, Garras Menores, Escupidores y Guerreros Nodo), sus 16 armas, sus habilidades y sus puntos.
- **Unidades en el estado:** cada miniatura pertenece a una unidad (la Escuadra de Asalto Táctico U1 y las Garras Menores U2 en la mesa inicial) y lleva el daño recibido.
- **Secuencia de ataque** (`rules/attack.ts`), pura y con dados del RNG del estado: impactar (críticos con 6, 1 siempre falla, modificadores ±1), herir con la tabla F contra R, salvar con FP, cobertura e invulnerable, y repartir el daño empezando por la miniatura herida (el sobrante se pierde). Habilidades: Pesada, Ráfaga, Sostenida, Letal, Devastadora, Explosiva, Torrente y Blindado, además de repetir los 1 (Al mando).
- **Pruebas:** `npm test` ejecuta 17 pruebas (tabla de herir, salvaciones, la secuencia con dados fijos, cada habilidad, reparto del daño, una prueba estadística de 10 000 disparos, determinismo, puntos, colocación sin solapes y deshacer).
- Todavía no hay cambios visibles en la mesa: esto es la base de las fases de disparo y combate.

## 0.7 · fase 1 (guardar y cargar mesas, #12) — fase 1 completa
- **Mesas con nombre:** el botón **Mesas** abre la biblioteca. Pon un nombre y *Guardar*; si el nombre ya existe, se sustituye esa mesa. Cada mesa guardada muestra la ronda, de quién es el turno, cuántas órdenes lleva y cuándo se guardó.
- **Ctrl+S:** guarda al momento con el nombre actual (aviso arriba); si la mesa aún no tiene nombre, abre el diálogo.
- **Cargar y borrar** piden un segundo clic, para no perder la mesa actual por accidente. El nombre de la mesa actual se ve en el panel del turno; *Nueva mesa* empieza una sin nombre.
- **Exportar e importar:** cualquier mesa (o la actual) se descarga como `nombre.mesa.json`. *Importar archivo…* la añade a la biblioteca (con «(2)» si el nombre ya está) y la carga. Los archivos que no son JSON, no son de Mesa de Guerra o están dañados se rechazan con un mensaje, sin tocar la mesa actual.
- Un archivo guarda la semilla y la lista de órdenes, así que pesa pocos KB y reproduce la partida exacta, dados incluidos.
- Con el diálogo abierto, los atajos de la mesa (Espacio, WASD, R…) no actúan.

## 0.6 · fase 1 (modelos definitivos, #11)
- **Legionario de la Escuadra de Asalto Táctico:** hombreras grandes con ribete dorado y emblema, pecho con águila, mochila con toberas, rodilleras, casco con rejilla y visor luminoso, y bólter con cargador y mira. Tres poses: *apuntando*, *en guardia* (rifle cruzado) y *avanzando* (zancada, rifle bajo).
- **Sargento:** casco rojo con cresta y laurel, pistola al frente, espada sierra en alto y un estandarte pequeño en la mochila. La peana lleva el borde dorado.
- **Garra Menor del Enjambre:** patas digitígradas, placas de quitina en el lomo, cola segmentada, cabeza alargada con cresta, mandíbulas y ojos que brillan, guadañas curvas y bracitos con garras. Tres poses: *acechando*, *lanzándose* y *erguida*.
- **Alfa del enjambre:** un 15 % más grande, quitina más oscura, cresta alta, espinas de hueso en el lomo y sacos que brillan en violeta.
- Peanas con superficie de tierra y piedrecitas. Cada pieza guarda su `pose` y si es `leader`; en la mesa inicial cada escuadra mezcla las tres poses y lleva su líder en el centro.
- Los modelos se construyen por articulaciones (nuevos ayudantes `segment` y `spike`): una pose es otro juego de puntos. Las miniaturas iguales comparten geometría.

## 0.5 · fase 1 (escenografía, #10)
- **Seis piezas low poly:** ruina (6"×4"), ruina grande de dos alturas (8"×6"), contenedores (4"×3"), cráter (5"), búnker (6"×4") y barricada (4"×1"). Los muros son rotos, con ventanas y cascotes, y siempre salen iguales.
- **Mapa de ejemplo:** cada mesa nueva trae 11 piezas en disposición simétrica (búnker en el centro y cinco piezas por bando), así ninguno de los dos lados tiene ventaja. Las mesas guardadas con versiones anteriores lo reciben al cargarse.
- **Bloqueada por defecto:** la escenografía no se coge al hacer clic, para poder seleccionar y medir las miniaturas que hay dentro o detrás. **T** o *Escenografía* la desbloquea y abre el panel.
- **Editar:** desbloqueada, se selecciona, se arrastra y se gira (**R**) como las miniaturas, y se borra con **Supr**. El panel añade cualquier pieza en el centro de la vista. La selección se marca con un rectángulo dorado.
- Todo son órdenes (`addTerrain`, `removeTerrain` y `moveMany`, que ahora también mueve escenografía): se deshace, se guarda y se reproduce igual en cualquier navegador.
- Las miniaturas se pueden poner dentro de las ruinas; todavía no se suben a los pisos altos ni encima del búnker.

## 0.4 · fase 1 (dados en 3D, #9)
- **Bandeja de dados** en un estante a la derecha de la mesa (fondo de fieltro, paredes de madera). **B** o *Ver bandeja* lleva la cámara allí.
- **Dados en 3D:** cada tirada se lanza en la bandeja; los dados ruedan, chocan entre sí y con las paredes, y se asientan planos sin quedar unos encima de otros. Hasta 40 dados de 16 mm con sus puntos.
- **El resultado lo manda el estado:** primero se deciden los dados con la semilla y después se simula el lanzamiento; al acabar, el dibujo de cada dado se gira para que la cara de arriba sea su resultado. La animación nunca contradice al panel.
- **Marcar y repetir:** clic en un dado de la bandeja lo marca (dorado); *Marcar unos* marca todos los 1. *Repetir N* vuelve a tirar solo los marcados, que se lanzan otra vez mientras los demás se quedan quietos. Es una orden nueva (`reroll`), con su deshacer, y el panel indica cuántos se han repetido.
- **Ordenar** coloca los dados en filas por resultado, de 6 a 1. **Retirar** los quita de la bandeja (la tirada sigue en el registro).
- Al deshacer, rehacer o cargar, los dados aparecen ya quietos, sin animación.

## 0.3 · fase 1 (cinta métrica, #8)
- **Cinta métrica** (tecla **M** o botón *Cinta*): clic y arrastre sobre la mesa mide en pulgadas. Si un extremo está en una miniatura, mide desde el borde de su peana; de peana a peana mide **borde a borde**, como en el tablero real. La cinta es amarilla, con una marca por pulgada y otra más larga cada 6", y se ve a través de las miniaturas.
- La medida **sigue a las miniaturas** si se mueven (o al deshacer) y se queda en la mesa hasta medir otra vez, un clic sin arrastrar, o **Esc** (el segundo Esc cierra la herramienta). Con la cinta activa, el clic izquierdo no selecciona ni mueve miniaturas.
- **Círculos de alcance** (tecla **C**, Mayús+C hacia atrás, o botón *Alcance*): alrededor de cada miniatura seleccionada, a 3", 6", 12", 18" o 24" del borde de su peana.
- Medir no es una orden: no se guarda ni se deshace.
- El panel del turno pasa abajo al centro, para que no lo tape la barra de herramientas.
- Código: `core/measure.ts` (medida borde a borde, pura, para las reglas de la fase 2), `input/picker.ts` (rayo compartido), `tools/tapeMeasure.ts` y `view/rangeRings.ts`.

## 0.2 · fase 1 (selección y grupos, #6 y #7)
- **Seleccionar:** clic en una miniatura; **Mayús+clic** añade o quita; arrastrar sobre el tapete traza un **recuadro de selección** (con Mayús, añade). **Ctrl+A** selecciona todo el bando que juega. **Esc** suelta la selección. Las seleccionadas llevan un anillo dorado y la que está bajo el ratón, uno tenue; abajo a la izquierda se ve cuántas hay de cada bando.
- **Mover en grupo:** al arrastrar una miniatura seleccionada se mueve toda la selección conservando la formación, sin salirse del tapete; la medida muestra las pulgadas recorridas.
- **Girar en grupo:** **R** (o Mayús+R) gira 45° la selección alrededor de su centro: cambian la orientación y la formación.
- **Sin solapes:** al soltar o girar, cada peana movida va al hueco libre más cercano a donde cayó; las que no se movían no se tocan. Es determinista (igual en cualquier navegador).
- **Una orden por gesto:** mover o girar un grupo es una sola orden `moveMany`, así que un Ctrl+Z lo deshace entero. Las mesas guardadas con la v0.1 se siguen cargando.
- Corregido: en los 3 primeros segundos tras abrir el juego, un solo clic en *Nueva mesa* borraba la mesa sin pedir confirmación.

## 0.1 · fase 0 (cimientos)
- **Mesa:** tablero de madera con patas, tapete de 60" × 44" (1 unidad = 1 pulgada), rejilla de 1" y de 6" (tecla **G**), zonas de despliegue de 10" tintadas en el color de cada bando y sala en penumbra con un foco cálido y sombras.
- **Cámara de mesa** (adaptada de Señorío): WASD o botón central para desplazar, Q/E o botón derecho para girar, rueda de 8" a 120"; cerca se ve a la altura de las miniaturas y lejos desde arriba. **V**: vista cenital. **Inicio**: vista inicial.
- **Miniaturas provisionales:** 5 legionarios (peana de 32 mm) y 10 Garras del Enjambre (peana de 25 mm), cada una fusionada en una malla por color.
- **Mover:** arrastrar con el botón izquierdo; junto al cursor se ven las pulgadas recorridas. **R** gira 45° la miniatura bajo el ratón. Esc cancela el arrastre.
- **Estado y órdenes:** toda acción (mover, girar, tirar dados, pasar turno) es una orden que se aplica al estado de la partida. **Ctrl+Z** deshace y **Ctrl+Y** rehace, sin límite.
- **Dados con semilla:** el generador vive dentro del estado, así que deshacer y rehacer una tirada da los mismos dados (y en el futuro dos navegadores verán lo mismo). **Espacio** tira, **+**/**−** cambian cuántos; los resultados salen ordenados y agrupados («2×6 1×5…»), con las cinco tiradas anteriores debajo.
- **Turnos:** ronda y bando activo arriba; **Intro** o *Pasar turno*.
- **Guardado:** automático en el navegador (semilla y lista de órdenes). *Nueva mesa* (dos clics) empieza otra.
