/**
 * Cuentas, sesiones, ranking y partidos en disco (liga.json).
 * No guarda contraseñas en texto plano.
 * El proceso de Node es la única escritura: cada operación lee, cambia y guarda
 * antes de devolver, así dos pedidos seguidos no se pisan.
 *
 * LAS CUENTAS NO SE PIERDEN AL SUBIR UNA VERSIÓN NUEVA:
 *  - El archivo ya NO vive dentro de la carpeta del proyecto (que se reemplaza en cada
 *    versión). Se busca, en este orden, un lugar que sobreviva a los cambios de versión:
 *      1. LIGA_DATA        (ruta completa del archivo)
 *      2. LIGA_DATA_DIR / DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH   (carpeta; p. ej. un Volume)
 *      3. /data o /var/data si existen y se puede escribir (Fly.io / Render con disco)
 *      4. ~/.liga-chaquito-f8/   (tu PC: lo comparten todas las versiones del juego)
 *      5. data/ dentro del proyecto (último recurso, es el comportamiento viejo)
 *  - Si hay un data/liga.json viejo dentro del proyecto, se migra solo (se copia o se fusiona).
 *  - Un archivo roto NUNCA se reemplaza por uno vacío: se aparta y se recupera de la copia (.bak).
 *  - Cada guardado deja una copia (.bak) y una copia por día (últimos 7 días).
 *  - Respaldo / restauración manual: ver exportarRespaldo() y restaurarRespaldo().
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
    accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync,
    readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const RUTA_VIEJA = join(RAIZ, "data", "liga.json");

function escribible(dir) {
    try {
        mkdirSync(dir, { recursive: true });
        accessSync(dir, constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function resolverAlmacenamiento() {
    const env = process.env;
    if (env.LIGA_DATA) return { ruta: env.LIGA_DATA, origen: "LIGA_DATA", volumen: true };
    for (const [nombre, dir] of [
        ["LIGA_DATA_DIR", env.LIGA_DATA_DIR],
        ["DATA_DIR", env.DATA_DIR],
        ["RAILWAY_VOLUME_MOUNT_PATH", env.RAILWAY_VOLUME_MOUNT_PATH],
    ]) {
        if (dir && escribible(dir)) return { ruta: join(dir, "liga.json"), origen: nombre, volumen: true };
    }
    for (const dir of ["/data", "/var/data"]) {
        if (existsSync(dir) && escribible(dir)) return { ruta: join(dir, "liga.json"), origen: "disco " + dir, volumen: true };
    }
    const casa = join(homedir(), ".liga-chaquito-f8");
    if (escribible(casa)) return { ruta: join(casa, "liga.json"), origen: "carpeta del usuario", volumen: false };
    return { ruta: RUTA_VIEJA, origen: "carpeta del proyecto", volumen: false };
}

const ALMACEN = resolverAlmacenamiento();
const DATA_PATH = ALMACEN.ruta;
const BAK_PATH = DATA_PATH + ".bak";

const SESION_MS = 30 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 8000;

function vacio() {
    return { v: 1, cuentas: [], sesiones: [], jugadores: [], partidos: [] };
}

/** Lee y valida un archivo de datos. Devuelve null si no existe o no es un liga.json válido. */
function parsear(ruta) {
    try {
        const data = JSON.parse(readFileSync(ruta, "utf8"));
        if (!data || data.v !== 1) return null;
        data.cuentas = Array.isArray(data.cuentas) ? data.cuentas : [];
        data.sesiones = Array.isArray(data.sesiones) ? data.sesiones : [];
        data.jugadores = Array.isArray(data.jugadores) ? data.jugadores : [];
        data.partidos = Array.isArray(data.partidos) ? data.partidos : [];
        return data;
    } catch {
        return null;
    }
}

function copiasDiarias() {
    try {
        const nombre = basename(DATA_PATH).replace(/\.json$/, "");
        return readdirSync(dirname(DATA_PATH))
            .filter((f) => f.startsWith(nombre + ".") && /\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
            .sort()
            .reverse()
            .map((f) => join(dirname(DATA_PATH), f));
    } catch {
        return [];
    }
}

function leer() {
    if (existsSync(DATA_PATH)) {
        const data = parsear(DATA_PATH);
        if (data) return data;
        // El archivo existe pero está roto: se aparta (no se borra) para que nunca se pise con uno vacío.
        const apartado = DATA_PATH + ".roto-" + Date.now();
        try {
            renameSync(DATA_PATH, apartado);
            console.error("[persistencia] liga.json ilegible, apartado en " + apartado);
        } catch (e) {
            console.error("[persistencia] liga.json ilegible y no se pudo apartar:", e.message);
        }
    }
    // Falta o estaba roto: se intenta recuperar de la última copia buena.
    for (const copia of [BAK_PATH, ...copiasDiarias()]) {
        const data = parsear(copia);
        if (data) {
            try {
                mkdirSync(dirname(DATA_PATH), { recursive: true });
                copyFileSync(copia, DATA_PATH);
            } catch { /* se sigue con lo leído */ }
            console.warn("[persistencia] datos recuperados desde " + copia + " (" + data.cuentas.length + " cuentas)");
            return data;
        }
    }
    return vacio();
}

function guardar(data) {
    const limite = Date.now() - SESION_MS;
    data.sesiones = data.sesiones.filter((s) => (s.creada || 0) > limite);
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    const tmp = DATA_PATH + ".tmp";
    writeFileSync(tmp, JSON.stringify(data));
    // Copia de lo anterior (si tenía algo) antes de reemplazarlo.
    try {
        if (existsSync(DATA_PATH) && statSync(DATA_PATH).size > 80) copyFileSync(DATA_PATH, BAK_PATH);
    } catch { /* la copia es un extra: no frena el guardado */ }
    renameSync(tmp, DATA_PATH);
    copiaDelDia(data);
}

/** Una copia por día (conserva las últimas 7). Solo si hay cuentas, para no copiar archivos vacíos. */
function copiaDelDia(data) {
    if (!data.cuentas.length) return;
    try {
        const hoy = new Date().toISOString().slice(0, 10);
        const destino = DATA_PATH.replace(/\.json$/, "") + "." + hoy + ".json";
        if (!existsSync(destino)) copyFileSync(DATA_PATH, destino);
        for (const vieja of copiasDiarias().slice(7)) unlinkSync(vieja);
    } catch { /* extra: no frena el guardado */ }
}

/** Suma a 'destino' las cuentas de 'origen' que todavía no existen (por id o por nombre). Nunca pisa ni borra. */
function fusionar(destino, origen) {
    const ids = new Set(destino.cuentas.map((c) => c.id));
    const nombres = new Set(destino.cuentas.map((c) => String(c.nombre).toLowerCase()));
    let agregadas = 0;
    for (const c of origen.cuentas) {
        if (!c || typeof c.id !== "string" || typeof c.nombre !== "string" || typeof c.hash !== "string" || typeof c.salt !== "string") continue;
        if (ids.has(c.id) || nombres.has(c.nombre.toLowerCase())) continue;
        destino.cuentas.push(c);
        ids.add(c.id);
        nombres.add(c.nombre.toLowerCase());
        agregadas++;
        const j = origen.jugadores.find((x) => x && x.cuentaId === c.id);
        if (j && !destino.jugadores.some((x) => x.cuentaId === c.id)) destino.jugadores.push(j);
        for (const p of origen.partidos) if (p && p.cuentaId === c.id) destino.partidos.push(p);
        for (const se of origen.sesiones) {
            if (se && se.cuentaId === c.id && !destino.sesiones.some((x) => x.token === se.token)) destino.sesiones.push(se);
        }
    }
    destino.partidos.sort((a, b) => (a.cuando || 0) - (b.cuando || 0));
    return agregadas;
}

/** Migra el data/liga.json viejo (dentro de la carpeta del proyecto) al lugar permanente. */
function migrarDatosViejos() {
    if (DATA_PATH === RUTA_VIEJA || !existsSync(RUTA_VIEJA)) return;
    const viejo = parsear(RUTA_VIEJA);
    if (!viejo) return;
    try {
        if (!existsSync(DATA_PATH)) {
            mkdirSync(dirname(DATA_PATH), { recursive: true });
            copyFileSync(RUTA_VIEJA, DATA_PATH);
            console.log("[persistencia] cuentas migradas desde " + RUTA_VIEJA + " (" + viejo.cuentas.length + ")");
        } else {
            const actual = leer();
            const n = fusionar(actual, viejo);
            if (n) {
                guardar(actual);
                console.log("[persistencia] " + n + " cuenta(s) del data/liga.json viejo sumadas a las actuales");
            }
        }
        renameSync(RUTA_VIEJA, RUTA_VIEJA + ".migrado");   // ya está a salvo: no se vuelve a procesar
    } catch (e) {
        console.error("[persistencia] no se pudo migrar el data/liga.json viejo:", e.message);
    }
}

migrarDatosViejos();

/** Dónde se guardan las cuentas (para mostrar en el log del servidor). */
export function infoAlmacenamiento() {
    const hospedaje = process.env.RAILWAY_ENVIRONMENT ? "Railway" : process.env.RENDER ? "Render"
        : process.env.FLY_APP_NAME ? "Fly.io" : process.env.GLITCH_DOMAIN ? "Glitch" : "";
    return {
        ruta: DATA_PATH,
        origen: ALMACEN.origen,
        // En un hosting sin disco persistente (Volume) las cuentas se borran en cada deploy.
        riesgo: !!hospedaje && !ALMACEN.volumen,
        hospedaje,
    };
}

/** Todo el contenido (cuentas con sus claves ya hasheadas). Sirve para bajar un respaldo. */
export function exportarRespaldo() {
    return leer();
}

/** Suma las cuentas de un respaldo a las actuales. Nunca borra ni pisa cuentas que ya existen. */
export function restaurarRespaldo(contenido) {
    let obj = contenido;
    if (typeof obj === "string") {
        try { obj = JSON.parse(obj); } catch { obj = null; }
    }
    if (!obj || obj.v !== 1 || !Array.isArray(obj.cuentas)) {
        return { status: 400, body: { ok: false, error: "No es un respaldo válido de liga.json." } };
    }
    const origen = {
        cuentas: obj.cuentas,
        sesiones: Array.isArray(obj.sesiones) ? obj.sesiones : [],
        jugadores: Array.isArray(obj.jugadores) ? obj.jugadores : [],
        partidos: Array.isArray(obj.partidos) ? obj.partidos : [],
    };
    const data = leer();
    const agregadas = fusionar(data, origen);
    if (agregadas) guardar(data);
    return { status: 200, body: { ok: true, cuentasAgregadas: agregadas, cuentasTotal: data.cuentas.length } };
}

function normalizarNombre(n) {
    return String(n || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function hashPass(password, salt) {
    return scryptSync(String(password), salt, 32).toString("hex");
}

function entero(n, max) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(max, v);
}

function modoValido(m) {
    return ["solo", "liga", "online"].includes(m) ? m : "solo";
}

function publicoJugador(j) {
    return {
        id: j.id,
        nombre: j.nombre,
        pj: j.pj || 0,
        pg: j.pg || 0,
        pp: j.pp || 0,
        pe: j.pe || 0,
        pts: j.pts || 0,
        gf: j.gf || 0,
        gc: j.gc || 0,
    };
}

function publicoPartido(p) {
    return {
        id: p.id,
        resultado: p.resultado,
        gf: p.gf || 0,
        gc: p.gc || 0,
        modo: p.modo || "solo",
        cuando: p.cuando,
    };
}

function ranking(data) {
    return data.jugadores
        .map(publicoJugador)
        .sort((a, b) => b.pts - a.pts || b.pg - a.pg || b.pj - a.pj || a.nombre.localeCompare(b.nombre, "es"));
}

function asegurarJugador(data, cuenta) {
    let j = data.jugadores.find((x) => x.cuentaId === cuenta.id);
    if (!j) {
        j = {
            id: "j_" + cuenta.id,
            cuentaId: cuenta.id,
            nombre: cuenta.nombre,
            pj: 0, pg: 0, pp: 0, pe: 0, pts: 0, gf: 0, gc: 0,
            ultimo: 0,
        };
        data.jugadores.push(j);
    } else {
        j.nombre = cuenta.nombre;
    }
    return j;
}

function crearSesion(data, cuentaId) {
    const token = randomBytes(24).toString("hex");
    data.sesiones.push({ token, cuentaId, creada: Date.now() });
    return token;
}

function sesionDe(data, token) {
    if (!token) return null;
    const sesion = data.sesiones.find((s) => s.token === token);
    if (!sesion) return null;
    const cuenta = data.cuentas.find((c) => c.id === sesion.cuentaId);
    if (!cuenta) return null;
    return { sesion, cuenta };
}

function aplicarResultado(jugador, resultado, gf, gc) {
    jugador.pj += 1;
    jugador.gf = (jugador.gf || 0) + gf;
    jugador.gc = (jugador.gc || 0) + gc;
    jugador.ultimo = Date.now();
    if (resultado === "win") {
        jugador.pg += 1;
        jugador.pts += 3;
    } else if (resultado === "loss") {
        jugador.pp += 1;
    } else {
        jugador.pe += 1;
        jugador.pts += 1;
    }
}

function payloadDe(payload) {
    const body = typeof payload === "string" ? { resultado: payload } : (payload || {});
    const resultado = body.resultado;
    if (!["win", "loss", "draw"].includes(resultado)) return null;
    return {
        resultado,
        gf: entero(body.gf, 40),
        gc: entero(body.gc, 40),
        modo: modoValido(body.modo),
        partidoId: body.partidoId ? String(body.partidoId).slice(0, 80) : "",
    };
}

export function registrar({ nombre, password }) {
    const n = normalizarNombre(nombre);
    if (n.length < 3) return { status: 400, body: { ok: false, error: "El nombre tiene que tener al menos 3 letras." } };
    if (!password || String(password).length < 4) return { status: 400, body: { ok: false, error: "La contraseña tiene que tener al menos 4 caracteres." } };
    const data = leer();
    if (data.cuentas.some((c) => c.nombre.toLowerCase() === n.toLowerCase())) {
        return { status: 409, body: { ok: false, error: "Ese jugador ya está registrado." } };
    }
    const salt = randomBytes(16).toString("hex");
    const cuenta = {
        id: "c_" + randomBytes(8).toString("hex"),
        nombre: n,
        salt,
        hash: hashPass(password, salt),
        creada: Date.now(),
    };
    data.cuentas.push(cuenta);
    const jugador = asegurarJugador(data, cuenta);
    const token = crearSesion(data, cuenta.id);
    guardar(data);
    return {
        status: 200,
        body: { ok: true, token, cuenta: { id: cuenta.id, nombre: cuenta.nombre }, jugador: publicoJugador(jugador) },
    };
}

export function entrar({ nombre, password }) {
    const n = normalizarNombre(nombre);
    const data = leer();
    const cuenta = data.cuentas.find((c) => c.nombre.toLowerCase() === n.toLowerCase());
    if (!cuenta) return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    let intento;
    let real;
    try {
        intento = Buffer.from(hashPass(password || "", cuenta.salt), "hex");
        real = Buffer.from(cuenta.hash, "hex");
    } catch {
        return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    }
    if (intento.length !== real.length || !timingSafeEqual(intento, real)) {
        return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    }
    const jugador = asegurarJugador(data, cuenta);
    const token = crearSesion(data, cuenta.id);
    guardar(data);
    return {
        status: 200,
        body: { ok: true, token, cuenta: { id: cuenta.id, nombre: cuenta.nombre }, jugador: publicoJugador(jugador) },
    };
}

export function salir(token) {
    if (!token) return;
    const data = leer();
    const antes = data.sesiones.length;
    data.sesiones = data.sesiones.filter((s) => s.token !== token);
    if (data.sesiones.length !== antes) guardar(data);
}

export function cuentaDe(token) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return null;
    const jugador = data.jugadores.find((x) => x.cuentaId === hallada.cuenta.id);
    return {
        cuenta: { id: hallada.cuenta.id, nombre: hallada.cuenta.nombre },
        jugador: jugador ? publicoJugador(jugador) : publicoJugador(asegurarJugador(data, hallada.cuenta)),
    };
}

export function listarRanking() {
    return ranking(leer());
}

export function resumen() {
    const data = leer();
    return {
        cuentas: data.cuentas.length,
        jugadores: data.jugadores.length,
        partidos: data.partidos.length,
        almacenamiento: { origen: ALMACEN.origen, permanente: ALMACEN.volumen || ALMACEN.origen === "carpeta del usuario" },
    };
}

export function historial(token, limite = 12) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    const n = Math.max(1, Math.min(30, parseInt(limite, 10) || 12));
    const partidos = data.partidos
        .filter((p) => p.cuentaId === hallada.cuenta.id)
        .slice(-n)
        .reverse()
        .map(publicoPartido);
    return { status: 200, body: { ok: true, partidos } };
}

function anotarEn(data, cuenta, info) {
    const jugador = asegurarJugador(data, cuenta);
    if (info.partidoId && data.partidos.some((p) => p.partidoId === info.partidoId && p.cuentaId === cuenta.id)) {
        return { status: 200, body: { ok: true, repetido: true, jugador: publicoJugador(jugador) } };
    }
    if (!info.partidoId && jugador.ultimo && Date.now() - jugador.ultimo < COOLDOWN_MS) {
        return { status: 429, body: { ok: false, error: "Esperá unos segundos antes de anotar otro partido." } };
    }
    aplicarResultado(jugador, info.resultado, info.gf, info.gc);
    data.partidos.push({
        id: "p_" + randomBytes(6).toString("hex"),
        partidoId: info.partidoId || "",
        cuentaId: cuenta.id,
        resultado: info.resultado,
        gf: info.gf,
        gc: info.gc,
        modo: info.modo,
        cuando: Date.now(),
    });
    if (data.partidos.length > 4000) data.partidos.splice(0, data.partidos.length - 4000);
    guardar(data);
    return { status: 200, body: { ok: true, jugador: publicoJugador(jugador) } };
}

export function anotarPartido(token, payload) {
    const info = payloadDe(payload);
    if (!info) return { status: 400, body: { ok: false, error: "Resultado inválido." } };
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    return anotarEn(data, hallada.cuenta, info);
}

/** Lo llama el servidor al terminar un partido online. No confía en el cliente. */
export function anotarOnline({ cuentaId, resultado, gf, gc, partidoId }) {
    if (!cuentaId || !partidoId) return { ok: false };
    const info = payloadDe({ resultado, gf, gc, modo: "online", partidoId });
    if (!info) return { ok: false };
    const data = leer();
    const cuenta = data.cuentas.find((c) => c.id === cuentaId);
    if (!cuenta) return { ok: false };
    const out = anotarEn(data, cuenta, info);
    return out.body;
}
