import type { DatasheetId } from "./datasheets";

// Trasfondo del Códice (#91): textos propios del juego.

export const FACTION_LORE = {
  legion: "La Legión Astral nació en los astilleros orbitales de Varo, cuando la humanidad dispersa decidió que sus mejores guerreros no volverían a morir de frío, de hambre o de miedo. Cada legionario pasa diez años de cirugías y entrenamiento antes de vestir la servoarmadura; a cambio, la Legión le promete un nombre en el Muro de Varo cuando caiga. Son pocos, lentos de reponer y casi imposibles de matar.",
  swarm: "Nadie sabe de dónde vino El Enjambre. Llega en esporas que caen como lluvia sobre un mundo, y en unas semanas los bosques se vuelven nidos y los ríos, canales de digestión. No tiene generales ni banderas: tiene nodos, criaturas que piensan por las demás. Si un nodo muere, miles de garras olvidan de golpe qué estaban haciendo.",
} as const;

export const UNIT_LORE: Record<DatasheetId, string> = {
  capitan: "Los capitanes no se eligen: se sobreviven. Un legionario asciende cuando es el último de su escuadra que sigue en pie, y lleva desde entonces la capa roja de los que vuelven. Junto a él, los demás disparan con la calma de quien sabe que alguien vigila.",
  asalto: "El cuerpo de la Legión. Diez legionarios con rifle bólter y cuchillo, entrenados para avanzar bajo fuego y sostener cualquier posición. Su sargento lleva la cuenta de cada baja en el antebrazo de la armadura.",
  fuegoPesado: "Cinco legionarios con armas que otros ejércitos montan en tanques. Necesitan anclar los pies para disparar bien, y por eso los capitanes les buscan una ruina alta y les dejan trabajar.",
  andador: "Un sarcófago de ceramita con piernas. Dentro va un legionario que ya no podría vivir fuera: el Andador es a la vez su arma y su respiradero. Su cañón de asalto escribe líneas rectas en el barro.",
  exterminadores: "Armadura de abordaje, pensada para pelear en los pasillos de una nave enemiga. Llegan desde la órbita en el peor momento para el rival, aguantan lo que les echen y aplastan lo que tocan con el puño de energía.",
  psiquico: "En la Legión, el don de la mente se trata como una herida: se vigila, se cura y se aprovecha. Los psíquicos llevan capucha para que sus hermanos no vean lo que les pasa por los ojos cuando el poder despierta.",
  motoristas: "Exploradores y cazadores. Rodean al enemigo, castigan a quien se queda solo y llegan antes que nadie a los objetivos. Su lema es corto, como sus permisos de reparación.",
  tirano: "El nodo mayor: una bestia del tamaño de un edificio que piensa por todo el Enjambre a su alrededor. Mientras vive, las criaturas cercanas no conocen el miedo. Cuando cae, el silencio se oye en kilómetros.",
  francotiradores: "Cinco legionarios con capa de camuflaje que no esperan a que empiece la batalla: ya están dentro de ella. Se cuelan de noche hasta media mesa y eligen a quién quitar de en medio. Ningún general del Enjambre está a salvo detrás de su escolta.",
  saltadores: "Legionarios con retrorreactores a la espalda que caen sobre el enemigo como meteoritos. El aterrizaje ya es un arma: lo que no aplasta la armadura lo remata la espada sierra.",
  medico: "Lleva la caja de herramientas más temida de la Legión: con ella cierra heridas, recoloca huesos y pone de pie a quien ya habían dado por muerto. Su escuadra pelea sabiendo que alguien vuelve a por ellos.",
  biomorteros: "Bestias acorazadas con un saco de gas en el lomo que escupen bolas de ácido en parábola. No necesitan ver a su presa: les basta con olerla al otro lado del muro.",
  reventadores: "Garras hinchadas de bilis hasta casi estallar. Corren hacia el enemigo sin miedo a morir, porque morir es justo lo que buscan: al reventar salpican ácido a quien las ha matado.",
  gargolas: "Garras con alas de membrana que vuelan bajo, en bandadas que tapan el sol. Pasan por encima de muros y búnkeres, escupen púas al vuelo y caen sobre quien creía tener la espalda cubierta.",
  garras: "Miles de ellas por cada nido. No piensan; corren, saltan y muerden. Una sola no es peligrosa. Veinte, sí. Cuando los nodos las empujan, cubren la tierra como una marea de quitina.",
  escupidores: "Criaturas con un saco de ácido en la garganta y la puntería de quien no necesita apuntar. Disuelven la armadura lentamente: el Enjambre siempre tiene tiempo.",
  nodo: "Guerreros grandes y listos, con cañones de hueso en los brazos. Son los nodos menores: llevan la voluntad del Tirano a los rincones del campo de batalla donde él no llega.",
  acechadores: "Excavan túneles bajo las líneas enemigas y salen detrás, entre los heridos. Sus cuchillas dobles atraviesan la servoarmadura como si fuera tela.",
  carnifice: "Una bestia de asedio con caparazón de placas y guadañas en lugar de brazos. Su sola presencia hace temblar a los soldados más duros; dispara pinchos que estallan al clavarse.",
  mente: "Un cerebro hinchado sobre un cuerpo enano, que flota a medio palmo del suelo. Siente las mentes enemigas y les grita sin voz hasta que revientan. Es también un nodo: donde está, el Enjambre piensa.",
};
