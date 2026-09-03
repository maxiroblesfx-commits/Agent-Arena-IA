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
