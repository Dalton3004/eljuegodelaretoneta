/**
 * Liga Chaquito F8 — Etapa 5.3
 * Matchmaking + autoridad del servidor (60 ticks/s).
 * El partido EN LÍNEA ejecuta la misma simulación que el modo OFFLINE
 * (ver sim_offline.js y partido_online.js).
 *
 * Cliente → servidor
 *   buscar_partido   { equipo }   id del equipo elegido
 *   input            { w, a, s, d, espacio, shift, e, r, q }
 *
 * Servidor → cliente
 *   en_cola          { posicion }
 *   partido_listo    { salaId, rol: "Local" | "Visitante", localId, visitanteId }
 *   sala_destruida   { salaId, motivo: "rival_desconectado" }
 *   estado_juego     { tick, estado, segundos, pelota, jugadores, marcador, equipos }
 *
 * El cliente no manda posiciones. Cada lado tiene 3 jugadores de campo + arquero
 * (como offline): WASD mueve al controlado, SHIFT corre, ESPACIO carga el tiro
 * o barre, E pasa, R pase largo y Q cambia. El id del controlado es el
 * socket.id; el resto va sin id (sin indicador).
 */

import express from "express";
import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Server } from "socket.io";
import { Partido, TICK_HZ } from "./partido_online.js";
import { anotarOnline, anotarPartido, cuentaDe, entrar, exportarRespaldo, historial, infoAlmacenamiento, listarRanking, registrar, restaurarRespaldo, resumen, salir } from "./persistencia.js";

const PORT = Number(process.env.PORT) || 3001;
const TICK_MS = 1000 / TICK_HZ;

// ---------------------------------------------------------------------------
// Red: cola, salas y bucle por partido
// ---------------------------------------------------------------------------

const app = express();
// HTTPS detrás de Render / Railway / proxies
app.set("trust proxy", 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    transports: ["websocket", "polling"],
});
const ROOT = dirname(fileURLToPath(import.meta.url));

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// ---------------------------------------------------------------------------
// Respaldo de cuentas (solo si definís la variable de entorno ADMIN_TOKEN).
//   Bajar:     GET  /api/admin/respaldo?clave=TU_ADMIN_TOKEN        (o header Authorization: Bearer ...)
//   Restaurar: POST /api/admin/restaurar   con el liga.json en el cuerpo
// Va antes del parser general porque un respaldo pesa más de 32 kb.
// ---------------------------------------------------------------------------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
function esAdmin(req) {
    if (!ADMIN_TOKEN) return false;
    const h = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    const dado = h ? h[1] : String(req.query.clave || "");
    const a = createHash("sha256").update(dado).digest();
    const b = createHash("sha256").update(ADMIN_TOKEN).digest();
    return timingSafeEqual(a, b);
}
app.get("/api/admin/respaldo", (req, res) => {
    if (!ADMIN_TOKEN) return res.sendStatus(404);
    if (!esAdmin(req)) return res.status(401).json({ ok: false, error: "Clave incorrecta." });
    res.setHeader("Content-Disposition", 'attachment; filename="liga-respaldo.json"');
    res.setHeader("Cache-Control", "no-store");
    res.type("json").send(JSON.stringify(exportarRespaldo()));
});
app.post("/api/admin/restaurar", express.json({ limit: "25mb" }), (req, res) => {
    if (!ADMIN_TOKEN) return res.sendStatus(404);
    if (!esAdmin(req)) return res.status(401).json({ ok: false, error: "Clave incorrecta." });
    const out = restaurarRespaldo(req.body);
    res.status(out.status).json(out.body);
});

app.use(express.json({ limit: "32kb" }));
app.use("/data", (_req, res) => res.sendStatus(404));
// Health check para el host (Render, Railway, etc.)
app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, servicio: "liga-chaquito-f8" });
});
app.use(express.static(ROOT));

function tokenDe(req) {
    const h = req.headers.authorization || "";
    const m = /^Bearer\s+([a-f0-9]+)$/i.exec(h);
    return m ? m[1] : "";
}

app.post("/api/registro", (req, res) => {
    const out = registrar(req.body || {});
    res.status(out.status).json(out.body);
});

app.post("/api/login", (req, res) => {
    const out = entrar(req.body || {});
    res.status(out.status).json(out.body);
});

app.post("/api/logout", (req, res) => {
    salir(tokenDe(req));
    res.json({ ok: true });
});

app.get("/api/yo", (req, res) => {
    const yo = cuentaDe(tokenDe(req));
    if (!yo) return res.status(401).json({ ok: false, error: "Sin sesión." });
    res.json({ ok: true, cuenta: yo.cuenta, jugador: yo.jugador });
});

app.get("/api/ranking", (_req, res) => {
    res.json({ ok: true, jugadores: listarRanking() });
});

app.get("/api/partidos", (req, res) => {
    const out = historial(tokenDe(req));
    res.status(out.status).json(out.body);
});

app.get("/api/salud", (_req, res) => {
    res.json({ ok: true, ...resumen(), enCola: cola.length, salasActivas: salas.size });
});

app.post("/api/partido", (req, res) => {
    const out = anotarPartido(tokenDe(req), req.body || {});
    res.status(out.status).json(out.body);
});


/** socketId → id de cuenta, si entró con sesión */
/** @type {Map<string, string>} */
const cuentaPorSocket = new Map();

function guardarRankingSala(sala) {
    const p = sala.partido;
    const gl = p.golesLocal;
    const gv = p.golesVisitante;
    const resLocal = gl > gv ? "win" : gl < gv ? "loss" : "draw";
    const resVis = gv > gl ? "win" : gv < gl ? "loss" : "draw";
    const cLocal = cuentaPorSocket.get(sala.localId);
    const cVis = cuentaPorSocket.get(sala.visitanteId);
    if (cLocal) anotarOnline({ cuentaId: cLocal, resultado: resLocal, gf: gl, gc: gv, partidoId: sala.id });
    if (cVis) anotarOnline({ cuentaId: cVis, resultado: resVis, gf: gv, gc: gl, partidoId: sala.id });
    if (cLocal || cVis) io.to(sala.id).emit("ranking_actualizado");
}
/** @type {string[]} */
const cola = [];
/** @type {Set<string>} */
const enCola = new Set();

/** @type {Map<string, { id: string, localId: string, visitanteId: string, partido: Partido, timer: NodeJS.Timeout }>} */
const salas = new Map();
/** @type {Map<string, string>} */
const salaDe = new Map();
/** socketId → id de equipo elegido en el cliente */
/** @type {Map<string, string>} */
const equipoDe = new Map();

function equipoValido(raw) {
    const id = typeof raw === "string" ? raw.trim().slice(0, 32) : "";
    return /^[a-z0-9_]+$/.test(id) ? id : "";
}

app.get("/", (_req, res) => {
    res.json({
        servicio: "liga-chaquito-f8",
        enCola: cola.length,
        salasActivas: salas.size,
    });
});

function encolar(socketId) {
    if (salaDe.has(socketId) || enCola.has(socketId)) return false;
    cola.push(socketId);
    enCola.add(socketId);
    return true;
}

function sacarDeCola(socketId) {
    if (!enCola.delete(socketId)) return false;
    const indice = cola.indexOf(socketId);
    if (indice !== -1) cola.splice(indice, 1);
    return true;
}

function crearSala(sockLocal, sockVisitante) {
    const salaId = randomUUID();
    const partido = new Partido(
        salaId,
        sockLocal.id,
        sockVisitante.id,
        equipoDe.get(sockLocal.id) || "",
        equipoDe.get(sockVisitante.id) || "",
    );
    equipoDe.delete(sockLocal.id);
    equipoDe.delete(sockVisitante.id);
    const sala = {
        id: salaId,
        localId: sockLocal.id,
        visitanteId: sockVisitante.id,
        partido,
        timer: setInterval(() => tickSala(salaId), TICK_MS),
    };
    salas.set(salaId, sala);
    salaDe.set(sockLocal.id, salaId);
    salaDe.set(sockVisitante.id, salaId);
    sockLocal.join(salaId);
    sockVisitante.join(salaId);

    const base = {
        salaId,
        localId: sockLocal.id,
        visitanteId: sockVisitante.id,
        equipos: {
            local: partido.equipoLocalId || "",
            visitante: partido.equipoVisitanteId || "",
        },
    };
    sockLocal.emit("partido_listo", { ...base, rol: "Local" });
    sockVisitante.emit("partido_listo", { ...base, rol: "Visitante" });
    io.to(salaId).emit("estado_juego", partido.snapshot());
    console.log(`[partido] ${salaId} Local=${sockLocal.id} Visitante=${sockVisitante.id}`);
}

function tickSala(salaId) {
    const sala = salas.get(salaId);
    if (!sala) return;
    const antes = sala.partido.estado;
    sala.partido.avanzar();
    if (sala.partido.estado === "FINALIZADO" && antes !== "FINALIZADO" && !sala.partido.rankingGuardado) {
        sala.partido.rankingGuardado = true;
        guardarRankingSala(sala);
    }
    io.to(salaId).emit("estado_juego", sala.partido.snapshot());
}

function destruirSala(salaId, motivo, idQueSalio) {
    const sala = salas.get(salaId);
    if (!sala) return;
    clearInterval(sala.timer);
    salas.delete(salaId);
    salaDe.delete(sala.localId);
    salaDe.delete(sala.visitanteId);

    for (const id of [sala.localId, sala.visitanteId]) {
        if (id === idQueSalio) continue;
        const rival = io.sockets.sockets.get(id);
        if (!rival) continue;
        rival.leave(salaId);
        rival.emit("sala_destruida", { salaId, motivo });
    }
    console.log(`[sala] ${salaId} destruida (${motivo})`);
}

function emparejar() {
    const listos = [];
    while (cola.length > 0) {
        const id = cola.shift();
        enCola.delete(id);
        const sock = io.sockets.sockets.get(id);
        if (sock?.connected && !salaDe.has(id)) listos.push(sock);
    }

    let i = 0;
    while (i + 1 < listos.length) {
        crearSala(listos[i], listos[i + 1]);
        i += 2;
    }
    if (i < listos.length) {
        const sobra = listos[i];
        cola.push(sobra.id);
        enCola.add(sobra.id);
    }
}

io.on("connection", (socket) => {
    socket.on("buscar_partido", (data) => {
        const equipo = equipoValido(data && data.equipo);
        if (equipo) equipoDe.set(socket.id, equipo);
        const token = data && typeof data.token === "string" ? data.token : "";
        const yo = token ? cuentaDe(token) : null;
        if (yo) cuentaPorSocket.set(socket.id, yo.cuenta.id);
        else cuentaPorSocket.delete(socket.id);
        if (!encolar(socket.id)) return;
        emparejar();
        if (enCola.has(socket.id)) {
            socket.emit("en_cola", { posicion: cola.indexOf(socket.id) + 1 });
        }
    });

    socket.on("input", (data) => {
        const salaId = salaDe.get(socket.id);
        const sala = salaId ? salas.get(salaId) : null;
        if (!sala) return;
        sala.partido.aplicarInput(socket.id, data);
    });

    socket.on("disconnect", () => {
        equipoDe.delete(socket.id);
        cuentaPorSocket.delete(socket.id);
        if (sacarDeCola(socket.id)) return;
        const salaId = salaDe.get(socket.id);
        if (salaId) destruirSala(salaId, "rival_desconectado", socket.id);
    });
});

const esEntradaDirecta = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esEntradaDirecta) {
    httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`[liga-chaquito] matchmaking + fisicas en :${PORT}`);
        const alm = infoAlmacenamiento();
        const r = resumen();
        console.log(`[liga-chaquito] cuentas: ${r.cuentas} · guardadas en ${alm.ruta} (${alm.origen})`);
        if (alm.riesgo) {
            console.warn(`[liga-chaquito] ATENCIÓN: ${alm.hospedaje} sin disco persistente. Las cuentas se BORRAN en cada deploy. `
                + "Agregá un Volume/disco y definí LIGA_DATA_DIR (ver DEPLOY.md).");
        }
        if (!process.env.ADMIN_TOKEN) console.log("[liga-chaquito] tip: definí ADMIN_TOKEN para poder bajar/restaurar un respaldo de las cuentas.");
    });
}

export { Partido };
