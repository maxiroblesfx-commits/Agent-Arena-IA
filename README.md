# CONFLUENCE desk

Desk de señales encima de FOMO. No es otro exchange.

**No copies a un trader. Copiá el momento en que varios coinciden.**

## Qué hace

- Watchlist de handles FOMO (semilla pública + los que pegues)
- Resolver de wallet pública: pegás `@handle` o una URL `fomo.family/profile/...`; el desk busca el match en el tape público y conserva la fuente
- Scout resolvió `@econoar` = eric.eth (SOL + EVM)
- Forensic veta PnL imposible
- Motor de confluencia: N wallets independientes, misma ventana, mismo token
- Rugwatch veta honeypots / freeze / tax absurdo
- Sizer usa % de bankroll, nunca el size del ballena
- Alerta + **1-click paper**. Auto **OFF**
- Paper trading con fees FOMO + DEX + priority + tax + slippage
- Blotter de operaciones y config de capital/fees
- Paneles arrastrables y redimensionables

## Publicar en GitHub Pages (link público)

El repo arranca **privado**: GitHub Pages no sirve sitios privados sin plan Pro, y este bot no puede cambiar visibilidad ni prender Pages.

En GitHub, vos:

1. **Settings → General → Danger zone → Change repository visibility → Public**
2. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. **Actions → github-pages → Run workflow** (o un push a esta rama)

Queda en:

**https://maxiroblesfx-commits.github.io/Agent-Arena-IA/**

Ahí el desk corre en el navegador (paper FOMO+DEX+tax+slip, sin Node). GitHub Pages **no simula movimientos**: sin un backend conectado el Tape queda detenido para no hacer pasar datos sintéticos por trades reales.

## Cómo correr local

```bash
node server.js
```

Abre `http://localhost:3000` (o `0.0.0.0:3000` en el host).

Vistas: **Desk** · **Paper** · **Config**.

Si `api.fomoscope.xyz` es alcanzable, el tape es live. Si no, corre snapshot + sim con traders y tokens reales verificados el 2026-09-02. `FOMOSCOPE_API_KEY` es opcional: sin key usa el bucket público; con key tiene una cuota propia. Para resolver cualquier perfil indexado por FomoScan, configurá opcionalmente `FOMOSCAN_API_KEY`; sin ella se usa el board público de FomoScope como fallback.

## Datos reales vs. demo

El tape real se obtiene desde el backend Node (`node server.js`) y su proveedor configurado. GitHub Pages no puede ejecutar ese backend, por eso la versión estática muestra **“tape sin backend”** y no genera operaciones ni alertas ficticias. Para probar el diseño con tráfico sintético, el modo demo es explícito: `DEMO_MODE=true node server.js` en Node o `?demo=1` en la página estática. Nunca se activa para visitantes normales.

## Handles y wallets

Pegá un `@handle`, el link completo `https://fomo.family/profile/handle` (también acepta links con query o `www`) o un share link. En el modo Node, Scout usa FomoScan si existe `FOMOSCAN_API_KEY` (resolución exacta de perfiles indexados) y, sin key, consulta el board público de FomoScope. La tarjeta muestra si fue resuelta, si el perfil fue verificado pero no tiene una address pública, si no hubo match público, o si el lookup estuvo temporalmente caído; ya no muestra un ambiguo “sin wallet”.

FOMO no publica todas las wallets de todos los perfiles. Si un handle no aparece en el tape público, abrí **pegar wallet verificada** en esa tarjeta y pegá una address Solana o EVM pública: queda asociada solo en tu `data/store.json` (o en el `localStorage` de GitHub Pages). Nunca pegues una seed phrase ni una private key.

En GitHub Pages no hay servidor para consultar el resolver en segundo plano, pero se aceptan correctamente links FOMO y el vínculo manual de wallets funciona y queda persistido en ese navegador.

## Radar y Tape densos

Radar ahora usa una grilla de tarjetas compactas y Tape usa microtarjetas: se muestran hasta 12 oportunidades y 36 eventos en el mismo espacio. El resumen deja visibles señal, riesgo, size, fees y neto; abrí **paper · fees…** para ver el ticket completo sin perder densidad.

## Paper

Cada fill cobra lo mismo que FOMO / Jupiter:

- FOMO follow: **$1 flat** (o % con piso $1)
- DEX / pool: **25 bps**
- Priority / tip: **$0.02**
- Token tax (del micro; la mayoría de pump = 0)
- Slippage: piso + lag + impacto vs mcap

Ida y vuelta. El PnL es mark menos esas fees.

## Política del CEO

- Auto-copy default OFF
- Solana first
- Bankroll paper $1,000 · 1.5% por tarjeta
- Max 4 abiertas · max −8% día
- El LLM no firma transacciones

## Scout — puntuar traders con datos reales

`tools/scout.js` reemplaza el puntaje `forensic()` (que medía popularidad:
KOL, followers, wallet resuelta) por dos métricas que se **multiplican**:

- **Edge** — ¿gana plata, o tuvo suerte? Expectativa neta por operación,
  concentración del PnL en las 3 mejores, drawdown, aciertos, liquidaciones.
- **Copiabilidad** — ¿te queda algo de ese edge? Tenencia mediana, si entra
  escalonado o de un golpe, y el costo medido de llegar un minuto tarde.

Se multiplican porque un trader excelente que entra y sale en 40 segundos es
incopiable: su PnL es real y tu copia da negativo.

```bash
node tools/scout.js 0xAddress1 0xAddress2      # puntúa y rankea
node tools/scout.js --days 180 --lag 0xAddr    # más historial + medir demora
node tools/scout.js --json scout.json 0xAddr   # vuelca todo
```

Todo sale del historial público de Hyperliquid (`/info`, sin API key). No hay
un solo número escrito a mano, y con menos de 30 operaciones cerradas **se
niega a puntuar** en vez de inventar una nota.

**Acepta addresses, no handles.** FOMO no publica un resolver de handles: abrí
el perfil, copiá la address pública y pegala. Una address de Solana se reporta
como fuera de alcance — esa pata necesita un indexador con key, no Hyperliquid.

## Break-even — cuánto tenés que hacer para no perder

`tools/breakeven.js` usa el mismo motor de fees que el paper trading, así que
el número y el blotter nunca se contradicen.

```bash
node tools/breakeven.js --bankroll 500 --mcap 1600000 --lag 800
node tools/breakeven.js --bankroll 500 --target 5    # ¿qué tamaño necesito?
```

Dos resultados que conviene tener presentes:

- **El fee flat es toda la causa del castigo a las posiciones chicas.** Con
  fee de $1, una posición de $10 necesita subir ~25%; sin fee flat, ~2%.
- **La curva es en U.** El fee fijo empuja a agrandar la posición y el impacto
  de mercado empuja a achicarla, así que existe un tamaño óptimo — y no es ni
  el más chico ni el más grande.

Los coeficientes de slippage (`impactSlip`) todavía son los heredados y no
están medidos: sirven para ordenar decisiones, no como precio garantizado.
Se reemplazan con datos reales cuando el ledger tenga historial.

## Encontrar la wallet de un perfil de FOMO

FOMO no muestra la address en la interfaz, pero la app se la pide a su propio
backend para armar la página: el dato ya está en el navegador.

`tools/browser/find-wallet.js` lo busca ahí — en el JSON embebido de la página
y en las respuestas de la API mientras se navega.

1. Abrí el perfil y **esperá a que cargue** — por ejemplo `fomo.family/profile/econoar`
2. Recién ahí `F12` → **Console** (si Chrome bloquea, escribí `allow pasting`)
3. Pegá el archivo y Enter. Escanea solo.

**No recargues la página**: una recarga borra el script. Para juntar más datos,
navegá *dentro* de la app (swaps, posiciones, un token) y repetí `wallets()`.

Comandos: `wallets()` · `endpoints()` · `dump()`

La página también trae los *mint* de los tokens operados, que **no** son la
wallet del trader, así que cada resultado muestra bajo qué campo apareció. La
clasificación compara **palabras**, no substrings — si no, `__NEXT_DATA__`
contaría como `ata` y descartaría la wallet buena.

### Lo que el CSP de FOMO reveló

El `Content-Security-Policy` de la app lista todos los dominios con los que
puede hablar. Es su arquitectura, publicada sin querer:

| Dominio | Qué es |
|---|---|
| `api.hyperliquid.xyz` + `wss://` | Perpetuos. Confirmado. |
| `mainnet.block-engine.jito.wtf` | Jito — ejecución de bundles en Solana |
| `fomo-api.mobula.io` + `wss://` | Mobula, su proveedor de datos de mercado |
| `auth.privy.io`, `*.rpc.privy.systems` | Privy — las wallets embebidas |
| `ws.relay.link` | Puentes entre cadenas |
| `token-media.defined.fi` | Metadata de tokens |

**`api.fomoscope.xyz` y `api.fomoscan.sh` no aparecen.** El CSP es la lista
cerrada de lo que la app puede llamar: si no están ahí, la app nunca los usó.
Es la evidencia más fuerte hasta ahora de que esos dos endpoints —de los que
depende todo `server.js`— fueron inventados.

### Solana

`node tools/scout.js <address-de-solana>` lee los swaps desde un RPC público
(sin API key) y aplica el mismo puntaje, con el resultado medido en SOL.

No intenta entender cada DEX. Lee lo único que no depende del programa usado:
cómo cambiaron los saldos del dueño en la transacción. Si un token subió y el
SOL bajó, fue compra. Funciona igual con Jupiter, Raydium, pump.fun o el que
venga después.

Dos detalles que los tests fijaron:

- **El polvo de la comisión no es plata cobrada.** Devolver el fee deja unos
  5000 lamports de residuo; sin un piso, una transferencia de tokens se leía
  como una venta.
- **Se cierra la posición con menos del 1% restante.** En Solana casi siempre
  queda polvo sin vender, y esperar el cero exacto dejaba operaciones abiertas
  para siempre.

Los swaps token→token se descartan: sin SOL de por medio no hay tamaño medible.

## La API de FOMO — mapa observado

Ninguna de estas rutas está adivinada: salieron de mirar qué llama la propia
app (`tools/browser/find-wallet.js` → `endpoints()`). Host `prod-api.fomo.family`.

| Ruta | Llamadas vistas | Devuelve |
|---|---:|---|
| `/v2/users/userHandle/<handle>` | 106 | `address`, `evmAddress`, `friendsFollowing[]` |
| `/v2/users/<userId>/swaps` | 474 | `swaps[]` — el historial de operaciones |
| `/v2/users/<userId>/balances` | 146 | posiciones abiertas |
| `/v2/users/<userId>/spotlight` | 8 | `bestTrades[].trade.userAddress` |
| `/v2/transfers/with/<userId>` | 16 | transferencias |
| `/trades/<tradeId>` | 285 | `transfers[]`, `swaps[]` |
| `/feed/tradingActivity` | 16 | el tape en vivo |
| `/proxy/filterTokens` | 1016 | metadata de tokens |
| `/tokenAllowList/detailed`, `/proxy/verifiedTokens` | 68 | catálogos |
| `/watchlist`, `/config`, `/v2/users` | — | varios |

Y fuera de ese host:

| | |
|---|---|
| `fomo-api.mobula.io/api/2/token/ohlcv-history` | **Historial de precios.** Es lo que permite medir el costo de llegar tarde con datos reales en vez de coeficientes inventados. |
| `auth.privy.io/api/v1/sessions` | Las cuentas vinculadas del usuario que mira |

### Cada trader tiene DOS addresses, y no son la misma

Este es el punto que costó entender:

| | econoar |
|---|---|
| **Identidad** — `userHandle/…` `address` / `evmAddress` | `HZrxCXCms8…` · `0x0cc1c39d…` |
| **Ejecución** — sus `swaps[].address` / `.recipient` y `spotlight` | `aX8G1EVfWk…` · `0x300b798feb…` |

La de identidad **no tiene actividad on-chain** (Solscan vacío): es la wallet
embebida de Privy. La de ejecución aparece en las 55.792 filas de sus propios
swaps. Falta comprobar en el explorador si esa segunda es de él o es el router
compartido de FOMO — si tiene millones de transacciones, es el router, y
entonces las operaciones no son atribuibles por trader en la cadena.

El `userId` de econoar es `c573ebfa-5e98-580c-ae15-c8672f11c151`, y se obtiene
del perfil: **handle → userId → swaps**. No hace falta ninguna wallet.

## Estado al 3 sep 2026 — dónde retomar

### El hallazgo que reordena el proyecto

La address que devuelve `userHandle/econoar` (`HZrxCXCms8…`) **no tiene
actividad on-chain**: Solscan la muestra vacía, y el RPC de Solana también.
Pero su perfil declara 401 trades y 48 posiciones abiertas.

La explicación es el CSP de la app: FOMO usa **wallets embebidas de Privy** y
ejecuta en Solana **vía Jito**. La address del perfil es de identidad; los
swaps se firman desde el router de FOMO.

**Consecuencia:** seguir a estos traders mirando la cadena no funciona. Su
actividad no es individualmente atribuible on-chain. La única fuente que los
separa uno por uno es la propia API de FOMO.

### La API real (observada, no supuesta)

Host `prod-api.fomo.family`:

| Endpoint | Devuelve |
|---|---|
| `userHandle/<handle>` | `responseObject.address`, `.evmAddress`, `.friendsFollowing[]` |
| `<userId>/swaps` | `responseObject.swaps[]` — el historial que necesitamos |
| `<userId>/balances` | posiciones abiertas |
| `feed/tradingActivity` | el tape en vivo |
| `trades/<id>` | `responseObject.transfers[]` |
| `v2/users`, `tokenAllowList/detailed`, `proxy/verifiedTokens` | catálogos |

### Próximo paso concreto

`tools/browser/export-swaps.js` en la consola del perfil de FOMO:

1. `muestra()` — imprime un swap crudo para conocer **la forma real** de los
   campos. No hay que adivinarlos: ese fue el error que produjo todo el
   catálogo falso que ya purgamos.
2. `exportar()` — descarga `swaps.json` con todo lo capturado.

Con esa forma a la vista se escribe el normalizador y `scout.js` puede puntuar
a econoar con su historial verdadero.

### Lo que quedó cerrado

- econoar **no** opera perpetuos en Hyperliquid (verificado, 180 días sin fills).
- Las addresses del catálogo viejo eran **falsas** (purgado).
- `api.fomoscope.xyz` y `api.fomoscan.sh` **no existen** en el CSP de la app.
- Con bankroll bajo y fee flat de $1, el break-even al 5% del capital es ~11,6%.
