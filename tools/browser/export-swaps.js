/* Exportador de operaciones desde la app de FOMO.
 *
 * POR QUÉ ESTO Y NO LA CADENA
 * La address del perfil es la de identidad (Privy) y no tiene actividad
 * on-chain: los swaps se firman desde el router de FOMO. O sea que seguir a
 * estos traders mirando Solana no funciona. La única fuente que los atribuye
 * uno por uno es la propia API de FOMO — la misma que usa la app.
 *
 * CÓMO USARLO
 *   1. Abrí el perfil y esperá a que cargue:  fomo.family/profile/econoar
 *   2. F12 → Console → (si hace falta) escribí:  allow pasting
 *   3. Pegá este archivo entero y Enter
 *   4. Bajá por la lista de swaps para que cargue más páginas
 *   5. Escribí:  muestra()     ← ver la forma real de un swap
 *                exportar()    ← descargar todo como swaps.json
 *
 *   NO RECARGUES: la recarga borra el script.
 */

(() => {
  if (window.__fomoExport) { console.log("Ya estaba cargado. Usá muestra() o exportar()."); return; }
  window.__fomoExport = true;

  const crudos = new Map();      // clave única -> objeto tal cual vino
  const vistas = new Map();      // url -> cuántas veces

  const INTERESA = /(swaps|trades|tradingActivity|positions|balances|activity)/i;

  function guardar(url, json) {
    vistas.set(url, (vistas.get(url) || 0) + 1);
    // Buscar arrays de objetos en cualquier nivel: no adivinamos la forma.
    const buscar = (o, ruta, prof) => {
      if (prof > 6 || !o || typeof o !== "object") return;
      if (Array.isArray(o)) {
        if (o.length && typeof o[0] === "object") {
          o.forEach((it, i) => {
            const k = it.id || it.txHash || it.signature || it.hash ||
                      `${ruta}#${i}:${it.timestamp || it.createdAt || it.time || ""}`;
            if (!crudos.has(k)) crudos.set(k, { __ruta: ruta, __url: url, ...it });
          });
        }
        return;
      }
      for (const [k, v] of Object.entries(o)) buscar(v, ruta ? ruta + "." + k : k, prof + 1);
    };
    buscar(json, "", 0);
  }

  const _fetch = window.fetch;
  window.fetch = async function (...a) {
    const url = typeof a[0] === "string" ? a[0] : (a[0] && a[0].url) || "";
    const res = await _fetch.apply(this, a);
    try {
      if (INTERESA.test(url) && (res.headers.get("content-type") || "").includes("json")) {
        res.clone().json().then((j) => guardar(url.split("?")[0], j)).catch(() => {});
      }
    } catch {}
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    this.addEventListener("load", () => {
      try {
        if (INTERESA.test(url)) guardar(String(url).split("?")[0], JSON.parse(this.responseText));
      } catch {}
    });
    return _open.call(this, m, url, ...r);
  };

  /** Muestra la forma real de lo que llega. No adivinamos campos: los miramos. */
  window.muestra = function (n = 2) {
    const todos = [...crudos.values()];
    if (!todos.length) {
      console.log("%cTodavía no capturé nada.", "color:#e66;font-weight:bold");
      console.log("Bajá por la lista de swaps del perfil para que la app pida más páginas.");
      return null;
    }
    console.log(`Capturados ${todos.length} objetos desde:`);
    console.table([...vistas.entries()].map(([url, veces]) => ({ url, veces })));
    console.log("Ejemplo crudo (pegale esto a Claude para que sepa la forma real):");
    for (const x of todos.slice(0, n)) console.log(JSON.stringify(x, null, 2));
    return todos.slice(0, n);
  };

  window.exportar = function (nombre = "swaps.json") {
    const todos = [...crudos.values()];
    if (!todos.length) { console.log("Nada para exportar todavía. Bajá por la lista y reintentá."); return; }
    const blob = new Blob([JSON.stringify(todos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    console.log(`%cDescargando ${todos.length} registros → ${nombre}`, "color:#0a0;font-weight:bold");
    return todos.length;
  };

  console.log("%cExportador cargado — NO recargues la página.", "color:#0a0;font-weight:bold;font-size:14px");
  console.log("Bajá por la lista de swaps y después:  muestra()   ·   exportar()");
})();
