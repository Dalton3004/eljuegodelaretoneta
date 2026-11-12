/**
 * Cuentas, sesiones, ranking y partidos en disco (data/liga.json).
 * No guarda contraseñas en texto plano.
 * El proceso de Node es la única escritura: cada operación lee, cambia y guarda
 * antes de devolver, así dos pedidos seguidos no se pisan.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_PATH = process.env.LIGA_DATA
    || join(dirname(fileURLToPath(import.meta.url)), "data", "liga.json");

const SESION_MS = 30 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 8000;

function vacio() {
    return { v: 1, cuentas: [], sesiones: [], jugadores: [], partidos: [] };
}

function leer() {
    try {
        const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
        if (!data || data.v !== 1) return vacio();
        data.cuentas = Array.isArray(data.cuentas) ? data.cuentas : [];
        data.sesiones = Array.isArray(data.sesiones) ? data.sesiones : [];
        data.jugadores = Array.isArray(data.jugadores) ? data.jugadores : [];
        data.partidos = Array.isArray(data.partidos) ? data.partidos : [];
        return data;
    } catch {
        return vacio();
    }
}

function guardar(data) {
    const limite = Date.now() - SESION_MS;
    data.sesiones = data.sesiones.filter((s) => (s.creada || 0) > limite);
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    const tmp = DATA_PATH + ".tmp";
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, DATA_PATH);
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
