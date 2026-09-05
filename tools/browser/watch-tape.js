/* Capturador del tape de FOMO. Junta datos con el tiempo.
 *
 * POR QUÉ EXISTE
 * La metadata de un token (market cap, precio) solo está disponible mientras
 * alguien lo tiene abierto: cuando la posición cierra, desaparece de la API.
 * Se comprobó — de 39 operaciones cerradas de econoar, 0 conservaban su
 * metadata. O sea que el dato de "cómo era el token cuando lo compró" hay que
 * capturarlo EN EL MOMENTO o se pierde para siempre.
 *
 * El tape (/feed/tradingActivity) trae marketCap, fdv y price en el instante
 * de cada operación, más quién la hizo y por cuánto. Guardando eso, cada
 * compra queda con su foto y la venta posterior da el resultado.
 *
 * CÓMO USARLO
 *   1. Abrí fomo.family y esperá a que cargue el feed
 *   2. F12 → Console → (si hace falta) escribí:  allow pasting
 *   3. Pegá este archivo entero y Enter
 *   4. Dejá la pestaña abierta. Podés seguir usando la app normalmente.
 *   5. Cuando quieras:  estado()      ← cuánto lleva juntado
 *                       exportar()    ← descargar como tape.json
 *
 *   A DIFERENCIA de export-swaps.js, este SOBREVIVE a las recargas: lo
 *   guardado queda en localStorage. Después de recargar, volvé a pegarlo para
 *   que siga capturando; lo viejo no se pierde.
 *
 *   Después, en la terminal:  node tools/learn.js tape.json
 */

(() => {
  const CLAVE = "__fomoTape";
  const FEED = /\/feed\/tradingActivity/i;
  const CADA_MS = 20000;        // cada cuánto pedir el tape por nuestra cuenta
  const TOPE = 40000;           // tope de items guardados (localStorage ~5MB)

  if (window.__fomoWatch) { console.log("Ya estaba corriendo. Usá estado() o exportar()."); return; }
  window.__fomoWatch = true;

  /* Lo ya capturado en sesiones anteriores. */
  let items = new Map();
  try {
    const previo = JSON.parse(localStorage.getItem(CLAVE) || "[]");
    for (const it of previo) if (it && it.id) items.set(it.id, it);
    if (items.size) console.log(`Recuperados ${items.size} eventos de antes.`);
  } catch (e) {
    console.warn("No se pudo leer lo guardado antes:", e.message);
  }

  let ultimaPeticion = null;    // la request real de la app, para poder repetirla
  let guardadoFallido = false;

  function persistir() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify([...items.values()]));
      guardadoFallido = false;
    } catch (e) {
      // Cuota llena: no se pierde lo que está en memoria, pero hay que exportar.
      if (!guardadoFallido) {
        console.warn(`No entra más en localStorage (${items.size} eventos). Corré exportar() ya para no perderlos.`);
        guardadoFallido = true;
      }
    }
  }

  function guardar(json) {
    const lista = (json && json.responseObject && json.responseObject.items) || [];
    let nuevos = 0;
    for (const it of lista) {
      if (!it || !it.id || items.has(it.id)) continue;
      if (items.size >= TOPE) {
        console.warn(`Tope de ${TOPE} eventos alcanzado. Corré exportar() y después limpiar().`);
        break;
      }
      items.set(it.id, { ...it, __visto: new Date().toISOString() });
      nuevos++;
    }
    if (nuevos) persistir();
    return nuevos;
  }

  /* Interceptar lo que la app pide sola: siempre funciona, sin tocar auth. */
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const r = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
      if (FEED.test(url)) {
        ultimaPeticion = { url, init: args[1] || null };
        r.clone().json().then(guardar).catch(() => {});
      }
    } catch (e) { /* nunca romper la app por capturar */ }
    return r;
  };

  /* Pedir el tape por nuestra cuenta, repitiendo la request que hizo la app.
   * No inventamos cómo se autentica: reusamos exactamente lo que ya funcionó. */
  let timer = setInterval(async () => {
    if (!ultimaPeticion) return;             // todavía no vimos ninguna: solo interceptamos
    try {
      const r = await _fetch(ultimaPeticion.url, ultimaPeticion.init || undefined);
      if (!r.ok) return;
      guardar(await r.json());
    } catch (e) { /* un fallo de red no corta la captura */ }
  }, CADA_MS);

  window.estado = function () {
    const vs = [...items.values()];
    if (!vs.length) { console.log("Todavía no se capturó nada. Dejá la pestaña abierta en el feed."); return; }
    const ts = vs.map((v) => Date.parse(v.createdAt)).filter(Number.isFinite);
    const traders = new Set(vs.map((v) => v.userHandle)).size;
    const tokens = new Set(vs.map((v) => v.tokenAddress)).size;
    console.log(`${vs.length} eventos · ${traders} traders · ${tokens} tokens`);
    console.log(`desde ${new Date(Math.min(...ts)).toLocaleString()} hasta ${new Date(Math.max(...ts)).toLocaleString()}`);
    console.log(`Cuando quieras: exportar()`);
    return vs.length;
  };

  window.exportar = function (nombre = "tape.json") {
    const vs = [...items.values()];
    const blob = new Blob([JSON.stringify(vs, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    console.log(`Descargando ${vs.length} eventos → ${nombre}`);
    return vs.length;
  };

  window.parar = function () {
    clearInterval(timer);
    window.fetch = _fetch;
    console.log("Captura detenida. Lo guardado sigue en localStorage.");
  };

  window.limpiar = function () {
    items = new Map();
    try { localStorage.removeItem(CLAVE); } catch (e) {}
    console.log("Borrado lo guardado. Empieza de cero.");
  };

  console.log("Capturando el tape. Dejá la pestaña abierta.");
  console.log("Comandos:  estado()  ·  exportar()  ·  parar()  ·  limpiar()");
})();
