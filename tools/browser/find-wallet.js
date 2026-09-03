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
 *   sniff()       TODAS las peticiones que hizo la página, incluso las de antes
 *                 de pegar esto. El navegador las guarda aunque no escuchemos.
 *   await grab()  vuelve a pedir esas URLs con tu sesión y busca la wallet
 *   wallets()     addresses encontradas, ordenadas por probabilidad
 *   endpoints()   URLs capturadas en vivo desde que se pegó el script
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

  /* Lo decisivo no es cuántas veces aparece una address, sino DÓNDE.
   *   responseObject.address        → el dueño del perfil. Es una sola.
   *   responseObject.swaps[].address → mucha gente distinta de un feed.
   * Una address de un feed puede aparecer 1800 veces y no ser de quien mirás,
   * así que el camino sin corchetes gana siempre sobre la frecuencia. */
  function clasificar(paths) {
    let bueno = false, malo = false, singular = false;
    for (const p of paths) {
      const segs = p.split(/[.\[\]]+/).filter(Boolean);
      const ws = palabras(segs[segs.length - 1] || "");
      const esLista = p.includes("[]");
      if (ws.some((w) => MALOS.has(w))) { malo = true; continue; }
      if (ws.some((w) => BUENOS.has(w))) {
        bueno = true;
        if (!esLista) singular = true;   // campo propio del perfil, no de una lista
      }
    }
    return { bueno, malo, singular };
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
    const orden = { "SÍ ← esta": 0, "de una lista": 1, "quizá": 2, "no (parece token)": 3 };
    const rows = [...found.entries()].map(([address, e]) => {
      const paths = [...e.paths];
      const { bueno, malo, singular } = clasificar(paths);
      return {
        address,
        tipo: EVM.test(address) ? "EVM" : "Solana",
        probable: malo ? "no (parece token)"
                : bueno && singular ? "SÍ ← esta"
                : bueno ? "de una lista"
                : "quizá",
        visto_en: paths.slice(0, 2).join(" · "),
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
    const propias = rows.filter((r) => r.probable === "SÍ ← esta");
    if (propias.length) {
      console.log("%cDel perfil que estás mirando:", "color:#0a0;font-weight:bold;font-size:14px");
      for (const r of propias.slice(0, 4)) console.log("  " + r.tipo.padEnd(7) + r.address + "   ← " + r.visto_en.split(" · ")[0]);
      console.log("Las marcadas 'de una lista' son de OTRA gente (feeds, seguidos): no las uses.");
    } else console.log("Ninguna propia todavía. Navegá dentro de la app y repetí wallets().");
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

  /** Todas las peticiones que hizo la página, incluidas las ANTERIORES a este
   *  script. El navegador las guarda en la Performance API aunque nosotros no
   *  estuviéramos escuchando. No trae el contenido, pero sí las URLs exactas. */
  window.sniff = function () {
    let entries = [];
    try { entries = performance.getEntriesByType("resource") || []; } catch {}
    const rows = entries
      .filter((e) => /fetch|xmlhttprequest/i.test(e.initiatorType || ""))
      .map((e) => e.name)
      .filter((u) => !/\.(js|css|png|jpe?g|svg|webp|woff2?|ico|mp4)(\?|$)/i.test(u));

    const vistos = new Map();
    for (const u of rows) {
      const base = u.split("?")[0];
      if (!vistos.has(base)) vistos.set(base, { url: u, veces: 0 });
      vistos.get(base).veces++;
    }
    const out = [...vistos.values()].sort((a, b) => b.veces - a.veces);
    if (!out.length) { console.log("La Performance API no guardó peticiones (¿pestaña recién abierta?)."); return []; }
    console.table(out.map((x) => ({ url: x.url.split("?")[0], veces: x.veces })));
    console.log("Ahora probá:  await grab()   — vuelve a pedir esas URLs y busca la wallet adentro.");
    window.__urls = out.map((x) => x.url);
    return out;
  };

  /** Vuelve a pedir esas mismas URLs (con tu sesión) y escanea las respuestas. */
  window.grab = async function (urls) {
    const lista = urls || window.__urls || (window.sniff(), window.__urls) || [];
    if (!lista.length) { console.log("No hay URLs. Corré sniff() primero."); return []; }
    console.log("Pidiendo " + lista.length + " URLs de nuevo...");
    let ok = 0, fail = 0;
    for (const u of lista.slice(0, 60)) {
      try {
        const r = await _fetch.call(window, u, { credentials: "include" });
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("json")) { fail++; continue; }
        walk(await r.json(), "GRAB " + u.split("?")[0].split("/").slice(-2).join("/"));
        ok++;
      } catch { fail++; }
    }
    console.log("Leídas " + ok + " respuestas (" + fail + " no se pudieron).");
    return window.wallets();
  };

  window.dump = function () {
    const out = { wallets: window.wallets(), endpoints: window.endpoints(), peticiones: window.sniff() };
    console.log(JSON.stringify(out, null, 2));
    return out;
  };

  console.log("%cScout cargado — NO recargues la página.", "color:#0a0;font-weight:bold;font-size:14px");
  const r = window.wallets();
  if (!r.length) console.log("%cEmpezá por:  sniff()   y después:  await grab()", "color:#e90;font-weight:bold;font-size:13px");
  console.log("Comandos:  sniff()   await grab()   wallets()   endpoints()   dump()");
})();
