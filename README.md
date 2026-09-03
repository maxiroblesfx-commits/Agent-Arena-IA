# CONFLUENCE desk

Desk de señales encima de FOMO. No es otro exchange.

**No copies a un trader. Copiá el momento en que varios coinciden.**

## Qué hace

- Watchlist de handles FOMO (semilla pública + los que pegues)
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

Ahí el desk corre en el navegador (paper FOMO+DEX+tax+slip, sin Node).

## Cómo correr local

```bash
node server.js
```

Abre `http://localhost:3000` (o `0.0.0.0:3000` en el host).

Vistas: **Desk** · **Paper** · **Config**.

Si `api.fomoscope.xyz` es alcanzable, el tape es live. Si no, corre snapshot + sim con traders y tokens reales verificados el 2026-09-02.

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
