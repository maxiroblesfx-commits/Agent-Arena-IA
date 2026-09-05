# Briefing — proyecto CONFLUENCE (Agent-Arena-IA)

Copiá todo esto como primer mensaje en un chat nuevo.

---

Necesito que retomes un proyecto. No sabés nada de él, así que acá está todo.

## Qué quiero lograr

Sigo a 3-4 traders en **FOMO** (app de trading social, `fomo.family`). Quiero un
desk que me avise en tiempo real cuando varios de ellos compran el mismo token
en la misma ventana —eso es la tesis: **no copiar a un trader, copiar el momento
en que varios coinciden**— y poder actuar de un click desde el celular.

## El repo

- **GitHub:** `maxiroblesfx-commits/Agent-Arena-IA`
- **Rama:** `claude/agent-arena-ia-continue-65p45l` (todo el trabajo está ahí; `main` está vacío)
- Node, sin dependencias. `node --test` → 84 tests, todos pasan.
- Leé el **README** completo antes de tocar nada: tiene el mapa de la API y el
  estado actual.

## Mi situación real

- **Capital de arranque: menos de $1.000.** Esto no es negociable ni optimizable.
- Por eso el proyecto corre **solo en paper** hasta pasar un gate cuantitativo.
  El desk se construye entero igual; lo único bloqueado es firmar operaciones reales.

## La aritmética que define todo

FOMO cobra un fee **flat de $1** por operación en la pata Solana. Un costo fijo
es veneno para posiciones chicas. Con mi capital:

| Tamaño | Posición | Tiene que subir para empatar |
|---|---|---|
| 1,5% de $500 | $7,50 | **35%** |
| 5% de $500 | $25 | **11,6%** |
| 20% de $500 | $100 | 5,3% |

Hay una calculadora en `tools/breakeven.js` que usa el mismo motor de fees que
el paper trading. Descubrió que **la curva es en U**: el fee fijo empuja a
agrandar la posición y el impacto de mercado empuja a achicarla, así que existe
un tamaño óptimo intermedio (~$100 en un token de $1,6M de market cap).

## Lo que se descubrió (todo verificado, nada supuesto)

**1. El repo tenía datos inventados y ya se purgaron.**
`lib/identity.js` traía un catálogo de 21 traders con wallets y PnL marcados
como "verificados", con `source: "fomoscan.sh + solscan"`. Se comprobó contra la
fuente real: las addresses **no eran las de econoar**. También declaraba PnL de
$128M a $192M en cuentas de 19 a 570 seguidores, con el umbral de veto calibrado
justo para dejarlos pasar. Todo eliminado.

**2. Los endpoints de los que dependía `server.js` no existen.**
`api.fomoscope.xyz` y `api.fomoscan.sh` no aparecen en el Content-Security-Policy
de la app de FOMO. El CSP es una lista cerrada: si no están ahí, la app nunca los
llamó ni puede llamarlos.

**3. El puntaje de traders medía popularidad, no habilidad.**
La función `forensic()` sumaba puntos por ser KOL, tener seguidores y tener
wallet resuelta. **Cero métricas de rendimiento.** Se reemplazó por
`tools/score.js`: **edge × copiabilidad**, multiplicados (un trader excelente que
entra y sale en 40 segundos es incopiable, y su edge no te sirve).

**4. econoar NO opera perpetuos en Hyperliquid.** Verificado: 180 días sin fills.
Opera memecoins de Solana.

**5. Cada trader tiene DOS addresses, y esto costó entender.**

| econoar | |
|---|---|
| **Identidad** (`userHandle/…` → `address`) | `HZrxCXCms81ryxwvYNycwcPmynXmPgcKV4C2FeDJA86e` — **Solscan vacío** |
| **Ejecución** (sus `swaps[].address`) | `aX8G1EVfWkRneHwWJN6RUecyGcXBYpz42yeKFa1rKiJ` — **Solscan también vacío, confirmado 2026-09-03** |

La de identidad es la wallet embebida de **Privy** y no tiene actividad on-chain.
**La de ejecución tampoco tiene ni un solo trade en Solscan** — no es que haga
falta un RPC mejor, esta address simplemente no aparece firmando transacciones
Solana de la forma en que `tools/sol.js` sabe leer.

**Consecuencia:** seguir a estos traders mirando la cadena **no funciona**, punto
final. `tools/sol.js` y el modo `scoutSolana` de `tools/scout.js` son un callejón
sin salida para este trader — no vale la pena seguir invirtiendo ahí. La única
fuente que los separa uno por uno es la API de FOMO.

**7. La forma real de un swap de FOMO, confirmada 2026-09-03 (pegada desde la
consola en el perfil de econoar):** no es "SOL vs token". Está financiado en
**USDC de Solana**, ejecutado por un provider llamado `RELAY`, contra un token
identificado con una address estilo `0x...` y `networkId=4663` — que no es
ningún chain EVM real que se pueda reconocer. Sin más ejemplos no se puede
confirmar qué es ese id; queda anotado como no verificado, no se asume nada.

Lo que sí sirve mucho: `humanUsdAmountIn` / `humanUsdAmountOut` ya vienen en
dólares realizados, con el slippage de la ruta adentro — no hace falta ir a
buscar precio histórico aparte para calcular P&L. El normalizador está en
`lib/fomoSwaps.js`, con los dos ejemplos reales como test (`test/fomoSwaps.test.js`).
Reconstruye episodios reusando `episodesFromSwaps()` de `tools/score.js` (el
campo se llama `sol` por compatibilidad, pero acá son dólares).

**6. Se mapeó la API real de FOMO** observando qué llama la propia app. Está
documentada en el README. Lo clave:

```
handle → userId → swaps        (no hace falta ninguna wallet)

GET prod-api.fomo.family/v2/users/userHandle/<handle>   → address, evmAddress, friendsFollowing[]
GET prod-api.fomo.family/v2/users/<userId>/swaps        → swaps[] ← el historial
GET prod-api.fomo.family/v2/users/<userId>/balances     → posiciones abiertas
GET prod-api.fomo.family/feed/tradingActivity           → el tape en vivo
GET fomo-api.mobula.io/api/2/token/ohlcv-history        → precios (para medir la demora)
```

El userId de econoar es `c573ebfa-5e98-580c-ae15-c8672f11c151`.

## Qué hay construido

| Archivo | Qué hace |
|---|---|
| `lib/fomo.js` | Cliente de la API de FOMO con los endpoints observados |
| `lib/resolve.js` | handle → wallet contra la fuente real |
| `tools/score.js` | El puntaje edge × copiabilidad |
| `tools/scout.js` | CLI que puntúa traders (Hyperliquid y Solana) |
| `tools/breakeven.js` | Cuánto tiene que subir el token para no perder |
| `tools/browser/find-wallet.js` | Snippet de consola: saca addresses y endpoints del navegador |
| `tools/browser/export-swaps.js` | Snippet de consola: exporta el historial de operaciones |
| `lib/fomoSwaps.js` | Normaliza un swap crudo de FOMO (USDC↔token vía RELAY) a episodios |
| `tools/scoreFomo.js` | CLI: `node tools/scoreFomo.js swaps.json` — agrupa por trader, puntúa y rankea |
| `lib/tape.js` | Lee el tape: compras/ventas, hitos de ganancia y tesis, cada uno por separado |
| `lib/positions.js` | Reconstruye el market cap de entrada de las posiciones abiertas |
| `tools/learn.js` | CLI: `node tools/learn.js tape.json` — describe qué termina mal y qué no |
| `tools/browser/watch-tape.js` | Snippet de consola: captura el tape con el tiempo (sobrevive recargas) |
| `dist/scout.js` | Todo el scout en un archivo, sin instalar nada |

Los snippets de `tools/browser/` van en la **consola del navegador** (F12) estando
en el perfil de FOMO. Todo lo que empieza con `node` va en PowerShell.

**8. Primer export real corrido (194 registros, 2026-09-03) — sin puntaje
todavía, y por qué.**

`exportar()` trae TODO lo que la app llamó mientras se navegaba, no solo
swaps: de 194 registros, 93 eran en realidad de `/balances` (posiciones
abiertas) mezclados en el mismo array. `tools/scoreFomo.js` los separa por
forma (¿tiene `inTokenAddress` + `outTokenAddress` en la raíz?) y avisa
cuántos descartó.

De los 101 swaps reales, los 101 se pudieron clasificar (ninguno cayó en
token↔token sin stable de por medio). Pero la ventana era corta —1 al 3 de
sept— y econoar tocó **50 tokens distintos y solo cerró 5 operaciones**: casi
todo sigue abierto. `tools/score.js` se niega a puntuar con menos de 30
cerradas, así que **todavía no había un puntaje real** con ese primer export.

De esas 5, igual había una señal para tener en cuenta: 80% de aciertos pero
**94% de la ganancia concentrada en 3 operaciones** — exactamente el patrón
que `edgeScore()` penaliza por "puede ser suerte, no habilidad". Con más
muestra (ver punto 9) se confirmó que era ruido, no señal: el cuadro se dio
vuelta del todo.

**9. Segundo export (554 registros, 39 operaciones cerradas, 28 ago – 3 sept)
— primer puntaje real, y es malo.**

Con volumen de verdad (315 swaps clasificados, 39 episodios cerrados, ya
supera el mínimo de 30) econoar da:

| | |
|---|---|
| Resultado neto | **-$43.689** |
| Aciertos | 26% |
| Top-3 del PnL | 62% (ni sus mejores 3 tapan el agujero) |
| Drawdown | 194% de lo que llegó a ganar |
| EDGE | **6 / 100** — expectativa neta negativa |
| Copiabilidad | 100 / 100 — entra escalonado, tenencia larga, fácil de seguir |
| **PUNTAJE FINAL** | **6 / 100** |

Verificado episodio por episodio (no es un outlier rompiendo el promedio):
gastó $176.865 en total, cobró $133.176. La pérdida está distribuida en
varias posiciones grandes, no concentrada en una sola falla puntual.

La copiabilidad alta no salva nada acá: es fácil de copiar, pero lo que hay
para copiar es una pérdida. **Con esta muestra, econoar no es un trader para
seguir** — al menos no en esta ventana de una semana. Falta correr el mismo
análisis con los otros 2-3 traders para poder comparar.

**Auditoría del número, antes de confiar en él** (no es un bug):
- Episodio por episodio: gastó $176.865 en total, cobró $133.176 — la suma
  cuadra exacto con el neto, no es un outlier de un solo registro roto.
- El export trajo también 7 `transfers` (depósitos de tokens, no swaps) que
  `episodesFromSwaps()` no ve. Solo uno se solapa con un episodio cerrado, y
  ese dio ganancia ($1.424) parcialmente con tokens que le llegaron gratis
  por transfer, no comprados — si algo, esto hace que el -$43.689 sea
  **generoso** con econoar, no exagerado.
- Ningún swap clasificado tiene `humanUsdAmountIn`/`Out` en cero o nulo, ni
  hay outliers de escala rara (>$50.000 en un solo swap). Los datos están
  limpios.

**Dato nuevo:** econoar no opera solo en Solana. Aparecieron swaps con
`inNetworkId`/`outNetworkId` = 8453 (Base) y 56 (BSC), vía USDC de Solana como
puente (provider `RELAY`, también aparecieron `JUPITER`, `DFLOW`, `OKX`). Esas
patas usan una **wallet EVM distinta** (`0x300b798feb4c06c6aea12bc5d37ab8d32ebeb429`)
que aparece como `address` en esos registros y como `recipient` en las patas
Solana — mismo trader, wallet distinta según la cadena del lado que ejecuta.
El normalizador no depende del campo `address`, así que esto no rompe nada,
pero quedó anotado por si hace falta más adelante.

**10. La metadata del token es EFÍMERA, y esto define toda la estrategia de
datos.**

Para saber "por qué un token salió mal" hace falta saber cómo era cuando lo
compraron: market cap, volumen, edad. Ese dato está en `/balances`... pero
`/balances` solo devuelve lo que el trader tiene **abierto ahora**. Cuando la
posición cierra, la característica desaparece de la API.

Comprobado: de las **39 operaciones cerradas de econoar, 0 conservan
metadata**; de los 93 tokens con metadata, ninguno tiene resultado todavía.
Resultado y característica están en conjuntos **disjuntos**. Con solo exports
de perfil no se puede aprender nada, y cada día sin capturar pierde datos que
no se recuperan.

**11. El tape (`/feed/tradingActivity`) resuelve eso, y trae cuatro tipos de
evento.** Cada uno da algo distinto:

| Tipo | Qué trae | Sirve para |
|---|---|---|
| `swap_buy` / `swap_sell` | `usdAmount`, `price`, `marketCap`, `fdv`, quién, cuándo | **La única pista sin sesgo**: muestra compras y ventas, salgan bien o mal |
| `user_trade_profit_milestone` | `entryTime`, `totalCostBasis`, `totalPnlUsd`, `totalPercentagePnl`, mcap/fdv/price | Ejemplo ya etiquetado, sin emparejar nada — **pero solo ganadores** |
| `thesis` | Texto de convicción + `usdValue`, `unrealizedPnlUsd`, `closedAt`, likes | La confluencia: quién declara convicción en qué, con su posición real |

**El sesgo que hay que tener presente siempre:** el feed publica hitos de
*ganancia*, nunca de pérdida. Un dataset armado solo con milestones enseña
cómo se ven los ganadores sin haber visto jamás un perdedor — el error de
supervivencia de manual, y la razón por la que `tools/learn.js` los reporta
en una sección aparte con la advertencia adelante. Solo `swap_buy`/`swap_sell`
ve las dos caras.

Y un límite de fondo que no se arregla con más datos: el tape solo muestra lo
que la gente **compró**. No hay contrafáctico de los tokens que ignoraron y
volaron, así que esto no puede enseñar a elegir en abstracto — solo a comparar
entre lo que este grupo ya elige.

## El próximo paso concreto

Lo más urgente es **empezar a capturar el tape**, porque es el único dato que
se pierde para siempre si no se guarda hoy (punto 10):

1. **No hace falta capturar 24/7.** `lib/positions.js` reconstruye el market
   cap de entrada de cada posición abierta desde un solo export de
   `/balances`: `mcap_ahora × (precio_entrada / precio_ahora)`. Validado con
   stablecoins (USDC da −0%, que es lo que tiene que dar). Alcanza con correr
   `export-swaps.js` cada tanto.
2. El tape (`watch-tape.js`) sigue siendo mejor —da el mcap exacto al operar,
   y de todos los traders— pero exige la PC prendida y la sesión abierta.
   El endpoint NO es público: da 401 sin login, así que no se puede automatizar
   sin meter un token de la cuenta en algún lado, y eso no vale la pena.
2. `node tools/learn.js tape.json` (acepta varios archivos y los une
   deduplicando, así el dataset crece export tras export).
3. Lo que hay que esperar: al principio va a decir **0 operaciones cerradas**,
   porque hace falta ver la compra Y la venta del mismo par (trader, token).
   Eso no es un error, es el costo de arrancar. Con días de captura empiezan a
   cerrarse.
4. En paralelo, seguir con `tools/browser/export-swaps.js` +
   `node tools/scoreFomo.js` para los otros 2-3 traders, para poder rankearlos
   — hoy solo hay datos de econoar (y da 6/100).

Nota de entorno: si algún día seguís esto desde un sandbox con red
restringida (como esta sesión), `fomo.family`, `prod-api.fomo.family` y
cualquier RPC/explorer de Solana pueden estar bloqueados por política de
egress — no es un bug del código, hay que conseguir los datos desde afuera
(navegador logueado) y pegarlos o subirlas como archivo.

## Cómo quiero que trabajes

Esto es lo más importante y viene de haber sido quemado:

- **Nunca inventes datos.** Ni una address, ni un PnL, ni la forma de una
  respuesta de API. Todo el desastre que hubo que purgar salió de una sesión
  anterior que adivinó endpoints y wallets y los marcó como "verificados".
- **Primero mirá, después escribas.** Si no sabés la forma de una respuesta,
  imprimila antes de parsearla.
- **Si algo no se puede comprobar, decilo.** "No pude verificar esto" es una
  respuesta válida; inventar no.
- **Escribí tests** y contame cuando un test encuentre un bug tuyo.
- Explicame en castellano, sin vueltas, y decime cuando me equivoco yo.

El plan completo está en https://claude.ai/code/artifact/b70b2609-fd79-45e5-9be2-c09af075561b
(sus secciones 03 y 04 quedaron desactualizadas por el hallazgo 5).
