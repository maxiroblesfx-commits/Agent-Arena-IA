/* Buscador de wallet + endpoints reales en FOMO.
 *
 * FOMO no muestra la address en la interfaz, pero la app se la pide a su
 * propio backend para armar la página: el dato ya está en tu navegador.
 *
 * ── CÓMO USARLO ────────────────────────────────────────────────────────────
 *   1. Abrí el perfil y ESPERÁ a que termine de cargar
 *        https://fomo.family/profile/econoar
 *   2. Recién ahí: F12 → pestaña "Console"
 *        (si Chrome bloquea el pegado, escribí  allow pasting  y Enter)
 *   3. Pegá todo este archivo y Enter. Escanea solo y te muestra lo que haya.
 *
 *   NO RECARGUES LA PÁGINA. Una recarga borra este script y perdés todo.
 *   Si querés más datos, navegá DENTRO de la app: clic en swaps, en
 *   posiciones, en un token. Cada clic dispara llamadas que el script escucha.
 *   Después volvé a escribir:   wallets()
 *
 * ── COMANDOS ───────────────────────────────────────────────────────────────
 *   wallets()     addresses encontradas, ordenadas por probabilidad
 *   endpoints()   qué URLs de API llamó la app (el contrato real)
 *   dump()        todo junto, para copiar y pegar de una
 */

(() => {
  if (window.__fomoScout) { console.log("Ya estaba cargado. Usá wallets()"); return; }
  window.__fomoScout = true;

  const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM = /^0x[a-fA-F0-9]{40}$/;

  // Se comparan como PALABRAS, no substrings: "__NEXT_DATA__" no cuenta
  // como "ata", ni "profile" como "lp".
  const BUENOS = new Set(["wallet","address","owner","user","account","pubkey",
                          "signer","trader","profile","creator","author","depositor"]);
  const MALOS = new Set(["mint","token","pool","pair","program","contract",
                         "lp","vault","ata","market","currency","coin","router"]);

  const found = new Map();
  const apis = new Map();

  const palabras = (k) => String(k)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());

  function clasificar(paths) {
    let bueno = false, malo = false;
    for (const p of paths) {
      const segs = p.split(/[.\[\]]+/).filter(Boolean);
      const ws = palabras(segs[segs.length - 1] || "");
      if (ws.some((w) => MALOS.has(w))) malo = true;
      else if (ws.some((w) => BUENOS.has(w))) bueno = true;
    }
    return { bueno, malo };
  }

  function record(v, path) {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!SOL.test(s) && !EVM.test(s)) return;
    if (/^\d+$/.test(s)) return;
    if (!found.has(s)) found.set(s, { paths: new Set(), hits: 0 });
    const e = found.get(s);
    e.paths.add(path); e.hits++;
  }

  function walk(o, path = "", d = 0) {
    if (d > 12 || o == null) return;
    if (typeof o === "string") return record(o, path);
    if (typeof o !== "object") return;
    if (Array.isArray(o)) { o.slice(0, 500).forEach((v) => walk(v, path + "[]", d + 1)); return; }
    for (const [k, v] of Object.entries(o)) walk(v, path ? path + "." + k : k, d + 1);
  }

  function scanPage() {
    for (const s of document.querySelectorAll("script")) {
      const t = s.textContent || "";
      if (t.length < 40 || t.length > 8e6) continue;
      try { walk(JSON.parse(t), s.id || "script"); continue; } catch {}
      const re = /"([A-Za-z0-9_]{2,40})"\s*:\s*"([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})"/g;
      let m; while ((m = re.exec(t))) record(m[2], (s.id || "script") + "." + m[1]);
    }
    // Estados que algunos frameworks dejan colgados de window.
    for (const k of ["__NEXT_DATA__","__NUXT__","__remixContext","__APOLLO_STATE__","__INITIAL_STATE__"]) {
      if (window[k]) { try { walk(window[k], k); } catch {} }
    }
  }

  function noteApi(url, ok) {
    const clean = String(url).split("?")[0];
    if (!/^https?:/.test(clean)) return;
    if (!apis.has(clean)) apis.set(clean, { llamadas: 0, conAddress: false });
    const e = apis.get(clean);
    e.llamadas++;
    if (ok) e.conAddress = true;
  }

  const _fetch = window.fetch;
  window.fetch = async function (...a) {
    const url = typeof a[0] === "string" ? a[0] : (a[0] && a[0].url) || "";
    const res = await _fetch.apply(this, a);
    try {
      if ((res.headers.get("content-type") || "").includes("json")) {
        res.clone().json().then((j) => {
          const antes = found.size;
          walk(j, "API " + String(url).split("?")[0].split("/").slice(-2).join("/"));
          noteApi(url, found.size > antes);
        }).catch(() => noteApi(url, false));
      } else noteApi(url, false);
    } catch {}
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.addEventListener("load", () => {
      try {
        const antes = found.size;
        walk(JSON.parse(this.responseText), "XHR " + String(url).split("?")[0].split("/").slice(-2).join("/"));
        noteApi(url, found.size > antes);
      } catch { noteApi(url, false); }
    });
    return _open.call(this, m, url, ...r);
  };

  window.wallets = function () {
    scanPage();
    const orden = { "SÍ ← esta": 0, "quizá": 1, "no (parece token)": 2 };
    const rows = [...found.entries()].map(([address, e]) => {
      const paths = [...e.paths];
      const { bueno, malo } = clasificar(paths);
      return {
        address,
        tipo: EVM.test(address) ? "EVM" : "Solana",
        probable: bueno && !malo ? "SÍ ← esta" : malo ? "no (parece token)" : "quizá",
        visto_en: paths.slice(0, 3).join(" · "),
        veces: e.hits,
      };
    }).sort((a, b) => (orden[a.probable] - orden[b.probable]) || b.veces - a.veces);

    if (!rows.length) {
      console.log("%cTodavía no hay addresses.", "color:#e66;font-weight:bold");
      console.log("NO recargues. Hacé clic dentro de la app — swaps, posiciones, un token —\n" +
                  "y volvé a escribir wallets(). Los datos llegan cuando la app los muestra.");
      return [];
    }
    console.table(rows);
    const buena = rows.find((r) => r.probable === "SÍ ← esta");
    if (buena) console.log("%cEsta es: " + buena.address, "color:#0a0;font-weight:bold;font-size:14px");
    else console.log("Ninguna clara todavía. Navegá dentro de la app y repetí wallets().");
    return rows;
  };

  window.endpoints = function () {
    const rows = [...apis.entries()]
      .map(([url, e]) => ({ url, llamadas: e.llamadas, trajo_address: e.conAddress ? "sí" : "" }))
      .sort((a, b) => b.llamadas - a.llamadas);
    if (!rows.length) { console.log("Sin llamadas capturadas todavía. Navegá dentro de la app."); return []; }
    console.table(rows);
    return rows;
  };

  window.dump = function () {
    const out = { wallets: window.wallets(), endpoints: window.endpoints() };
    console.log(JSON.stringify(out, null, 2));
    return out;
  };

  console.log("%cScout cargado — NO recargues la página.", "color:#0a0;font-weight:bold;font-size:14px");
  const r = window.wallets();
  if (!r.length) console.log("Navegá dentro de la app (swaps, posiciones) y escribí:  wallets()");
  console.log("Comandos:  wallets()   endpoints()   dump()");
})();
