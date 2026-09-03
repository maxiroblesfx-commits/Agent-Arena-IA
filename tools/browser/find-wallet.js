/* Buscador de wallet en el perfil de FOMO.
 *
 * FOMO no muestra la address en la interfaz, pero la app se la pide a su
 * propio backend para armar la página. Esto la busca ahí: en los datos que
 * el navegador YA recibió. No scrapea nada ni pide permisos.
 *
 * CÓMO USARLO
 *   1. Abrí el perfil:  https://fomo.family/profile/econoar
 *   2. F12 → pestaña "Console"  (en Chrome puede pedirte escribir "allow pasting")
 *   3. Pegá TODO este archivo y Enter
 *   4. Recargá la página (F5) y esperá a que cargue
 *   5. Escribí   wallets()   y Enter
 *
 * Ojo: la página también contiene los "mint" de los tokens que operó.
 * Esos NO son su wallet. Por eso cada resultado muestra bajo qué nombre
 * apareció — mirá los que digan wallet / address / owner / user.
 */

(() => {
  const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const EVM = /^0x[a-fA-F0-9]{40}$/;

  // Nombres de campo que suelen contener a la persona, y los que no.
  // Se comparan como PALABRAS, no como substrings: "__NEXT_DATA__" no puede
  // contar como "ata", ni "profile" como "lp".
  const BUENOS = new Set(["wallet","address","owner","user","account","pubkey",
                          "signer","trader","profile","creator","author"]);
  const MALOS = new Set(["mint","token","pool","pair","program","contract",
                         "lp","vault","ata","market","currency","coin"]);

  /** "tokenMint" -> ["token","mint"] · "wallet_address" -> ["wallet","address"] */
  function palabras(clave) {
    return String(clave)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase());
  }

  /** Clasifica por el nombre del campo donde apareció, no por la ruta entera. */
  function clasificar(paths) {
    let bueno = false, malo = false;
    for (const p of paths) {
      const segs = p.split(/[.\[\]]+/).filter(Boolean);
      const clave = segs[segs.length - 1] || "";
      const ws = palabras(clave);
      if (ws.some((w) => MALOS.has(w))) malo = true;
      else if (ws.some((w) => BUENOS.has(w))) bueno = true;
    }
    return { bueno, malo };
  }

  const found = new Map();   // address -> { paths:Set, hits:number }

  function record(value, path) {
    if (typeof value !== "string") return;
    const v = value.trim();
    if (!SOL.test(v) && !EVM.test(v)) return;
    if (/^[0-9]+$/.test(v)) return;                 // números largos, no addresses
    if (!found.has(v)) found.set(v, { paths: new Set(), hits: 0 });
    const e = found.get(v);
    e.paths.add(path);
    e.hits++;
  }

  function walk(obj, path = "", depth = 0) {
    if (depth > 12 || obj == null) return;
    if (typeof obj === "string") return record(obj, path);
    if (typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.slice(0, 400).forEach((v, i) => walk(v, path + "[]", depth + 1));
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, path ? path + "." + k : k, depth + 1);
    }
  }

  function scanInlineJson() {
    for (const s of document.querySelectorAll("script")) {
      const txt = s.textContent || "";
      if (txt.length < 40 || txt.length > 8_000_000) continue;
      // Next.js y similares dejan el estado del servidor en un <script>.
      try { walk(JSON.parse(txt), s.id || "script"); continue; } catch {}
      // Si no es JSON puro, buscamos pares "clave":"address" dentro del texto.
      const re = /"([A-Za-z0-9_]{2,40})"\s*:\s*"([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})"/g;
      let m;
      while ((m = re.exec(txt))) record(m[2], (s.id || "script") + "." + m[1]);
    }
  }

  // Intercepta las respuestas de la API mientras navegás.
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) {
        res.clone().json().then((j) => walk(j, "API " + String(url).split("?")[0].slice(-60))).catch(() => {});
      }
    } catch {}
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener("load", () => {
      try { walk(JSON.parse(this.responseText), "XHR " + String(url).split("?")[0].slice(-60)); } catch {}
    });
    return _open.call(this, method, url, ...rest);
  };

  window.wallets = function () {
    scanInlineJson();
    const rows = [...found.entries()].map(([addr, e]) => {
      const paths = [...e.paths];
      const { bueno, malo } = clasificar(paths);
      return {
        address: addr,
        tipo: EVM.test(addr) ? "EVM" : "Solana",
        probable: bueno && !malo ? "SÍ ← esta" : malo ? "no (parece token)" : "quizá",
        visto_en: paths.slice(0, 3).join(" · "),
        veces: e.hits,
      };
    });
    const orden = { "SÍ ← esta": 0, "quizá": 1, "no (parece token)": 2 };
    rows.sort((a, b) => (orden[a.probable] - orden[b.probable]) || b.veces - a.veces);

    if (!rows.length) {
      console.log("%cNo apareció ninguna address.", "color:#c00;font-weight:bold");
      console.log("Probá: recargar con la consola ya abierta, entrar a la pestaña de swaps,\n" +
                  "o abrir una operación suya. La app pide los datos recién cuando los muestra.");
      return rows;
    }
    console.table(rows);
    console.log("Copiá la que diga 'SÍ ← esta'. Si hay varias, la que aparezca en más lugares.");
    return rows;
  };

  console.log("%cListo. Recargá la página (F5) y después escribí:  wallets()",
              "color:#0a0;font-weight:bold;font-size:13px");
})();
