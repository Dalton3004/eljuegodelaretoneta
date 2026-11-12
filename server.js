/**
 * Liga Chaquito F8 — Etapa 5.2
 * Matchmaking + autoridad del servidor (físicas a 60 ticks/s).
 *
 * Cliente → servidor
 *   buscar_partido   { equipo }   id del equipo elegido
 *   input            { w, a, s, d, espacio, shift, e, q }
 *
 * Servidor → cliente
 *   en_cola          { posicion }
 *   partido_listo    { salaId, rol: "Local" | "Visitante", localId, visitanteId }
 *   sala_destruida   { salaId, motivo: "rival_desconectado" }
 *   estado_juego     { tick, estado, segundos, pelota, jugadores, marcador, equipos }
 *
 * El cliente no manda posiciones. Cada lado tiene 4 jugadores: WASD mueve
 * al controlado, SHIFT corre, ESPACIO tira o barre, E pasa y Q cambia.
 * El id del controlado es el socket.id; el resto va sin id (sin indicador).
 */

import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Server } from "socket.io";
import { anotarOnline, anotarPartido, cuentaDe, entrar, historial, listarRanking, registrar, resumen, salir } from "./persistencia.js";

const PORT = Number(process.env.PORT) || 3001;
const TICK_HZ = 60;
const TICK_MS = 1000 / TICK_HZ;
const DT = 1 / TICK_HZ;

/** Constantes de cancha y movimiento, alineadas al partido single-player. */
const FISICA = {
    WIDTH: 480,
    HEIGHT: 640,
    FIELD: { LEFT: 78, RIGHT: 402, TOP: 99, BOTTOM: 572 },
    GOAL_NORTH: { x: 188, y: 48, w: 104, h: 51, lineY: 99, backY: 48 },
    GOAL_SOUTH: { x: 188, y: 550, w: 104, h: 58, lineY: 572, backY: 608 },
    BALL_FRICTION: 0.98,
    BALL_BOUNCE: 0.82,
    BALL_RADIUS: 9,
    BALL_STOP_THRESHOLD: 0.12,
    PLAYER_SPEED: 2.4,
    PLAYER_SPRINT: 4.1,
    PLAYER_RADIUS: 13,
    POSSESSION_RANGE: 18,
    KICK_POWER: 11.5,
    PASS_POWER: 6.2,
    SLIDE_SPEED: 6.2,
    SLIDE_DURATION: 0.38,
    SLIDE_COOLDOWN: 0.55,
    SHOT_CHARGE_MAX: 1.25,
    MATCH_SECONDS: 180,
    GOAL_CELEBRATION_SEC: 2.8,
};

// ---------------------------------------------------------------------------
// Pelota
// ---------------------------------------------------------------------------

class Pelota {
    constructor(x, y) {
        this.pos = { x, y };
        this.vel = { x: 0, y: 0 };
        this.radius = FISICA.BALL_RADIUS;
        this.owner = null;
        this.kickCooldown = 0;
    }

    update() {
        if (this.kickCooldown > 0) this.kickCooldown--;

        if (this.owner) {
            let fx = this.owner.facing.x;
            let fy = this.owner.facing.y;
            if (Math.abs(fx) + Math.abs(fy) < 0.1) {
                fx = 0;
                fy = this.owner.team === "local" ? -1 : 1;
            }
            this.pos.x = this.owner.pos.x + fx * 18;
            this.pos.y = this.owner.pos.y + fy * 18;
            this.vel.x = 0;
            this.vel.y = 0;
            return;
        }

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        this.vel.x *= FISICA.BALL_FRICTION;
        this.vel.y *= FISICA.BALL_FRICTION;
        if (Math.abs(this.vel.x) < FISICA.BALL_STOP_THRESHOLD) this.vel.x = 0;
        if (Math.abs(this.vel.y) < FISICA.BALL_STOP_THRESHOLD) this.vel.y = 0;
        this._rebotarParedes();
    }

    _rebotarParedes() {
        const f = FISICA.FIELD;
        const r = this.radius;
        const gn = FISICA.GOAL_NORTH;
        const gs = FISICA.GOAL_SOUTH;
        const enBocaNorte = this.pos.x > gn.x + r * 0.85 && this.pos.x < gn.x + gn.w - r * 0.85;
        const enBocaSur = this.pos.x > gs.x + r * 0.85 && this.pos.x < gs.x + gs.w - r * 0.85;

        if (this.pos.x - r < f.LEFT) {
            this.pos.x = f.LEFT + r;
            this.vel.x = -this.vel.x * FISICA.BALL_BOUNCE;
        }
        if (this.pos.x + r > f.RIGHT) {
            this.pos.x = f.RIGHT - r;
            this.vel.x = -this.vel.x * FISICA.BALL_BOUNCE;
        }
        if (this.pos.y - r < f.TOP) {
            if (!enBocaNorte) {
                this.pos.y = f.TOP + r;
                this.vel.y = Math.abs(this.vel.y) * FISICA.BALL_BOUNCE;
            } else if (this.pos.y - r < gn.backY) {
                this.pos.y = gn.backY + r;
                this.vel.y = Math.abs(this.vel.y) * 0.38;
            }
        }
        if (this.pos.y + r > f.BOTTOM) {
            if (!enBocaSur) {
                this.pos.y = f.BOTTOM - r;
                this.vel.y = -Math.abs(this.vel.y) * FISICA.BALL_BOUNCE;
            } else if (this.pos.y + r > gs.backY) {
                this.pos.y = gs.backY - r;
                this.vel.y = -Math.abs(this.vel.y) * 0.38;
            }
        }
    }

    kick(dx, dy, power) {
        this.owner = null;
        this.kickCooldown = 18;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) {
            dx = 0;
            dy = -1;
        } else {
            dx /= len;
            dy /= len;
        }
        this.vel.x = dx * power;
        this.vel.y = dy * power;
    }

    reset(x, y) {
        this.pos.x = x;
        this.pos.y = y;
        this.vel.x = 0;
        this.vel.y = 0;
        this.owner = null;
        this.kickCooldown = 0;
    }
}

// ---------------------------------------------------------------------------
// Jugador  (humano: el servidor aplica WASD + ESPACIO)
// ---------------------------------------------------------------------------

class Jugador {
    constructor(x, y, team, socketId) {
        this.pos = { x, y };
        this.home = { x, y };
        this.vel = { x: 0, y: 0 };
        this.facing = { x: 0, y: team === "local" ? -1 : 1 };
        this.radius = FISICA.PLAYER_RADIUS;
        this.team = team;
        this.socketId = socketId;
        this.hasBall = false;
        this.frozen = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.shotCharging = false;
        this.shotCharge = 0;
        this.controlado = socketId != null;
        this.input = { w: false, a: false, s: false, d: false, espacio: false, shift: false, e: false, q: false };
        this._espacioDown = false;
        this._espacioUp = false;
        this._eDown = false;
        this._qDown = false;
        this._conPelota = 0;
    }

    aplicarInput(data) {
        const espacio = !!(data.espacio || data.space);
        const e = !!(data.e || data.pase);
        const q = !!(data.q || data.cambio);
        if (espacio && !this.input.espacio) this._espacioDown = true;
        if (!espacio && this.input.espacio) this._espacioUp = true;
        if (e && !this.input.e) this._eDown = true;
        if (q && !this.input.q) this._qDown = true;
        this.input.w = !!(data.w || data.arriba);
        this.input.a = !!(data.a || data.izquierda);
        this.input.s = !!(data.s || data.abajo);
        this.input.d = !!(data.d || data.derecha);
        this.input.espacio = espacio;
        this.input.shift = !!(data.shift || data.sprint);
        this.input.e = e;
        this.input.q = q;
    }

    consumirOrdenes() {
        const orden = { pase: this._eDown, cambio: this._qDown };
        this._eDown = false;
        this._qDown = false;
        return orden;
    }

    consumirEspacio(pelota) {
        if (this._espacioDown) this._accionEspacio(pelota);
        if (this._espacioUp) this._soltarEspacio(pelota);
        this._espacioDown = false;
        this._espacioUp = false;
    }

    descartarEspacio() {
        this._espacioDown = false;
        this._espacioUp = false;
    }

    mover() {
        if (this.frozen) {
            this.vel.x = 0;
            this.vel.y = 0;
            return;
        }
        if (this.slideCooldown > 0) this.slideCooldown -= DT;
        if (this.shotCharging && this.hasBall) {
            this.shotCharge = Math.min(FISICA.SHOT_CHARGE_MAX, this.shotCharge + DT);
        } else if (this.shotCharging && !this.hasBall) {
            this.shotCharging = false;
            this.shotCharge = 0;
        }

        if (this.isSliding) {
            this.slideTimer -= DT;
            this.pos.x += this.facing.x * FISICA.SLIDE_SPEED;
            this.pos.y += this.facing.y * FISICA.SLIDE_SPEED;
            if (this.slideTimer <= 0) {
                this.isSliding = false;
                this.slideCooldown = FISICA.SLIDE_COOLDOWN;
                this.vel.x = 0;
                this.vel.y = 0;
            }
            return;
        }

        let dx = 0;
        let dy = 0;
        if (this.input.w) dy -= 1;
        if (this.input.s) dy += 1;
        if (this.input.a) dx -= 1;
        if (this.input.d) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;
            const freno = this.hasBall ? 0.76 : 1;
            const base = this.input.shift ? FISICA.PLAYER_SPRINT : FISICA.PLAYER_SPEED;
            const speed = base * freno;
            const response = 0.19;
            this.vel.x += (dx * speed - this.vel.x) * response;
            this.vel.y += (dy * speed - this.vel.y) * response;
            this.facing.x = dx;
            this.facing.y = dy;
        } else {
            this.vel.x = 0;
            this.vel.y = 0;
        }
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
    }

    limitarCancha() {
        const f = FISICA.FIELD;
        const r = this.radius;
        const norte = FISICA.GOAL_NORTH.backY - r + 2;
        const sur = FISICA.GOAL_SOUTH.backY + r - 2;
        this.pos.x = Math.max(f.LEFT + r, Math.min(f.RIGHT - r, this.pos.x));
        this.pos.y = Math.max(norte, Math.min(sur, this.pos.y));
    }

    tomarPelota(pelota) {
        if (pelota.owner === this) {
            this.hasBall = true;
            return;
        }
        this.hasBall = false;
        if (pelota.kickCooldown > 0 || this.isSliding) return;
        const dist = Math.hypot(this.pos.x - pelota.pos.x, this.pos.y - pelota.pos.y);
        if (dist >= FISICA.POSSESSION_RANGE || Math.hypot(pelota.vel.x, pelota.vel.y) >= 4) return;
        if (pelota.owner) {
            const dueno = Math.hypot(pelota.owner.pos.x - pelota.pos.x, pelota.owner.pos.y - pelota.pos.y);
            if (dist >= dueno - 2) return;
            pelota.owner.hasBall = false;
        }
        pelota.owner = this;
        this.hasBall = true;
    }

    contactoBarrida(pelota) {
        if (!this.isSliding || this.frozen) return;
        const dist = Math.hypot(this.pos.x - pelota.pos.x, this.pos.y - pelota.pos.y);
        if (dist > this.radius + pelota.radius + 2) return;
        const len = Math.hypot(this.facing.x, this.facing.y) || 1;
        pelota.kick(this.facing.x / len, this.facing.y / len, FISICA.SLIDE_SPEED);
        this.hasBall = false;
    }

    _accionEspacio(pelota) {
        if (this.frozen) return;
        if (this.hasBall && pelota.owner === this) {
            if (!this.shotCharging) {
                this.shotCharging = true;
                this.shotCharge = 0;
            }
            return;
        }
        if (!this.hasBall && !this.isSliding && this.slideCooldown <= 0) {
            this.isSliding = true;
            this.slideTimer = FISICA.SLIDE_DURATION;
            this.vel.x = 0;
            this.vel.y = 0;
        }
    }

    _soltarEspacio(pelota) {
        if (!this.shotCharging) return;
        const carga = Math.max(0, Math.min(1, this.shotCharge / FISICA.SHOT_CHARGE_MAX));
        this.shotCharging = false;
        this.shotCharge = 0;
        if (this.frozen || !this.hasBall || pelota.owner !== this) return;
        this._patear(pelota, 0.65 + carga * 0.70);
    }

    _patear(pelota, multiplicador) {
        const arcoY = this.team === "local"
            ? FISICA.GOAL_NORTH.y + FISICA.GOAL_NORTH.h / 2
            : FISICA.GOAL_SOUTH.y + FISICA.GOAL_SOUTH.h / 2;
        let gx = FISICA.WIDTH / 2 - this.pos.x;
        let gy = arcoY - this.pos.y;
        const glen = Math.hypot(gx, gy) || 1;
        gx /= glen;
        gy /= glen;
        let ax = this.facing.x;
        let ay = this.facing.y;
        if (Math.hypot(ax, ay) < 0.1) {
            ax = gx;
            ay = gy;
        }
        const alen = Math.hypot(ax, ay) || 1;
        ax /= alen;
        ay /= alen;
        let dx = ax * 0.32 + gx * 0.68;
        let dy = ay * 0.32 + gy * 0.68;
        const dlen = Math.hypot(dx, dy) || 1;
        pelota.kick(dx / dlen, dy / dlen, FISICA.KICK_POWER * multiplicador);
        this.hasBall = false;
    }

    pasar(pelota, companeros) {
        if (this.frozen || !this.hasBall || pelota.owner !== this) return;
        let mejor = null;
        let mejorPuntaje = -Infinity;
        const ataqueArriba = this.team === "local";
        for (const t of companeros) {
            if (t === this) continue;
            const dx = t.pos.x - this.pos.x;
            const dy = t.pos.y - this.pos.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 25 || dist > 240) continue;
            const adelante = ataqueArriba ? (this.pos.y - t.pos.y) : (t.pos.y - this.pos.y);
            const ax = dx / dist;
            const ay = dy / dist;
            const alineado = this.facing.x * ax + this.facing.y * ay;
            const puntaje = adelante * 0.4 + alineado * 40 - dist * 0.15;
            if (puntaje > mejorPuntaje) {
                mejorPuntaje = puntaje;
                mejor = t;
            }
        }
        if (mejor) {
            pelota.kick(mejor.pos.x - this.pos.x, mejor.pos.y - this.pos.y, FISICA.PASS_POWER);
            this.facing.x = (mejor.pos.x - this.pos.x);
            this.facing.y = (mejor.pos.y - this.pos.y);
        } else {
            pelota.kick(this.facing.x || 0, this.facing.y || (ataqueArriba ? -1 : 1), FISICA.PASS_POWER * 0.85);
        }
        this.hasBall = false;
    }

    moverIA(pelota) {
        if (this.frozen) {
            this.vel.x = 0;
            this.vel.y = 0;
            return;
        }
        if (this.slideCooldown > 0) this.slideCooldown -= DT;
        if (this.hasBall && pelota.owner === this) {
            this._conPelota += 1;
            if (this._conPelota > 28) {
                this._patear(pelota, 0.72);
                this._conPelota = 0;
                return;
            }
        } else {
            this._conPelota = 0;
        }

        let tx = this.home.x;
        let ty = this.home.y;
        if (!pelota.owner && Math.hypot(this.pos.x - pelota.pos.x, this.pos.y - pelota.pos.y) < 90) {
            tx = pelota.pos.x;
            ty = pelota.pos.y;
        } else if (pelota.owner && pelota.owner.team === this.team && pelota.owner !== this) {
            tx = (pelota.owner.pos.x + this.home.x) / 2;
            ty = (pelota.owner.pos.y + this.home.y) / 2;
        }
        const dx = tx - this.pos.x;
        const dy = ty - this.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
            const speed = FISICA.PLAYER_SPEED * 0.75;
            this.vel.x = (dx / dist) * speed;
            this.vel.y = (dy / dist) * speed;
            this.facing.x = dx / dist;
            this.facing.y = dy / dist;
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
        } else {
            this.vel.x = 0;
            this.vel.y = 0;
        }
    }

    reset() {
        this.pos.x = this.home.x;
        this.pos.y = this.home.y;
        this.vel.x = 0;
        this.vel.y = 0;
        this.hasBall = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.shotCharging = false;
        this.shotCharge = 0;
        this.facing.x = 0;
        this.facing.y = this.team === "local" ? -1 : 1;
    }

    snapshot() {
        return {
            rol: this.team === "local" ? "Local" : "Visitante",
            id: this.socketId || "",
            x: this.pos.x,
            y: this.pos.y,
            vx: this.vel.x,
            vy: this.vel.y,
            dirX: this.facing.x,
            dirY: this.facing.y,
            tienePelota: this.hasBall,
            deslizando: this.isSliding,
            sprint: !!(this.controlado && this.input.shift),
        };
    }
}

function separar(a, b) {
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dist = Math.hypot(dx, dy);
    const minimo = a.radius + b.radius;
    if (dist >= minimo) return;
    const nx = dist < 0.001 ? 1 : dx / dist;
    const ny = dist < 0.001 ? 0 : dy / dist;
    const empuje = (minimo - dist) / 2;
    a.pos.x -= nx * empuje;
    a.pos.y -= ny * empuje;
    b.pos.x += nx * empuje;
    b.pos.y += ny * empuje;
}

// ---------------------------------------------------------------------------
// Partido de una sala. Única fuente de la verdad.
// ---------------------------------------------------------------------------

class Partido {
    constructor(salaId, localId, visitanteId, equipoLocal, equipoVisitante) {
        const cx = FISICA.WIDTH / 2;
        const cy = FISICA.HEIGHT / 2;
        this.salaId = salaId;
        this.equipoLocalId = equipoLocal || "";
        this.equipoVisitanteId = equipoVisitante || "";
        this.tick = 0;
        this.estado = "EN_JUEGO";
        this.framesRestantes = FISICA.MATCH_SECONDS * TICK_HZ;
        this.timerFestejo = 0;
        this.golesLocal = 0;
        this.golesVisitante = 0;
        this.pelota = new Pelota(cx, cy);
        // El primero de cada lista arranca controlado. Q rota el socket.id.
        this.equipoLocal = [
            new Jugador(cx, 460, "local", localId),
            new Jugador(cx - 64, 500, "local", null),
            new Jugador(cx + 64, 500, "local", null),
            new Jugador(cx, 380, "local", null),
        ];
        this.equipoVisitante = [
            new Jugador(cx, 180, "visitante", visitanteId),
            new Jugador(cx - 64, 140, "visitante", null),
            new Jugador(cx + 64, 140, "visitante", null),
            new Jugador(cx, 260, "visitante", null),
        ];
        this.porSocket = new Map([
            [localId, this.equipoLocal[0]],
            [visitanteId, this.equipoVisitante[0]],
        ]);
    }

    get local() {
        return this.equipoLocal.find((j) => j.controlado);
    }

    get visitante() {
        return this.equipoVisitante.find((j) => j.controlado);
    }

    todos() {
        return this.equipoLocal.concat(this.equipoVisitante);
    }

    aplicarInput(socketId, data) {
        const jugador = this.porSocket.get(socketId);
        if (!jugador || !data || typeof data !== "object") return;
        jugador.aplicarInput(data);
    }

    cambiarControl(team) {
        const equipo = team === "local" ? this.equipoLocal : this.equipoVisitante;
        const actual = equipo.findIndex((j) => j.controlado);
        if (actual < 0) return;
        const siguiente = (actual + 1) % equipo.length;
        const socketId = equipo[actual].socketId;
        const vacio = { w: false, a: false, s: false, d: false, espacio: false, shift: false, e: false, q: false };
        equipo[actual].controlado = false;
        equipo[actual].socketId = null;
        equipo[actual].input = { ...vacio };
        equipo[actual].shotCharging = false;
        equipo[siguiente].controlado = true;
        equipo[siguiente].socketId = socketId;
        equipo[siguiente].input = { ...vacio, q: true };
        this.porSocket.set(socketId, equipo[siguiente]);
    }

    _ordenesHumanos() {
        for (const lado of ["local", "visitante"]) {
            const equipo = lado === "local" ? this.equipoLocal : this.equipoVisitante;
            const ctrl = equipo.find((j) => j.controlado);
            if (!ctrl) continue;
            const orden = ctrl.consumirOrdenes();
            if (ctrl.frozen) {
                ctrl.descartarEspacio();
                continue;
            }
            ctrl.consumirEspacio(this.pelota);
            if (orden.pase) ctrl.pasar(this.pelota, equipo);
            if (orden.cambio) this.cambiarControl(lado);
        }
    }

    avanzar() {
        this.tick++;
        if (this.estado === "FINALIZADO") return;
        if (this.estado === "CELEBRANDO_GOL") {
            this._festejo();
            return;
        }

        this.framesRestantes--;
        if (this.framesRestantes <= 0) {
            this.framesRestantes = 0;
            this.estado = "FINALIZADO";
            this.pelota.owner = null;
            for (const j of this.todos()) j.hasBall = false;
            return;
        }

        this._ordenesHumanos();
        for (const j of this.todos()) {
            if (j.controlado) j.mover();
            else j.moverIA(this.pelota);
        }
        const cuerpos = this.todos();
        for (let i = 0; i < cuerpos.length; i++) {
            for (let k = i + 1; k < cuerpos.length; k++) separar(cuerpos[i], cuerpos[k]);
        }
        for (const j of cuerpos) j.limitarCancha();
        for (const j of cuerpos) j.tomarPelota(this.pelota);
        for (const j of cuerpos) j.contactoBarrida(this.pelota);
        this.pelota.update();
        this._verificarGoles();
    }

    _verificarGoles() {
        const b = this.pelota;
        const gn = FISICA.GOAL_NORTH;
        const gs = FISICA.GOAL_SOUTH;
        const boca = b.radius * 0.85;
        const golNorte = b.pos.y < gn.lineY
            && b.pos.x > gn.x + boca
            && b.pos.x < gn.x + gn.w - boca
            && b.pos.y > gn.backY - b.radius;
        const golSur = b.pos.y > gs.lineY
            && b.pos.x > gs.x + boca
            && b.pos.x < gs.x + gs.w - boca
            && b.pos.y < gs.backY + b.radius;
        if (!golNorte && !golSur) return;

        if (golNorte) this.golesLocal++;
        else this.golesVisitante++;

        this.estado = "CELEBRANDO_GOL";
        this.timerFestejo = FISICA.GOAL_CELEBRATION_SEC;
        this.pelota.owner = null;
        for (const j of this.todos()) {
            j.frozen = true;
            j.hasBall = false;
            j.isSliding = false;
            j.vel.x = 0;
            j.vel.y = 0;
            j.shotCharging = false;
        }
    }

    _festejo() {
        this.timerFestejo -= DT;
        if (this.timerFestejo > 0) return;
        const cx = FISICA.WIDTH / 2;
        const cy = FISICA.HEIGHT / 2;
        this.pelota.reset(cx, cy);
        for (const j of this.todos()) {
            j.reset();
            j.frozen = false;
        }
        this.estado = this.framesRestantes > 0 ? "EN_JUEGO" : "FINALIZADO";
    }

    snapshot() {
        return {
            salaId: this.salaId,
            tick: this.tick,
            estado: this.estado,
            segundos: Math.ceil(this.framesRestantes / TICK_HZ),
            pelota: {
                x: this.pelota.pos.x,
                y: this.pelota.pos.y,
                vx: this.pelota.vel.x,
                vy: this.pelota.vel.y,
            },
            jugadores: this.todos().map((j) => j.snapshot()),
            marcador: {
                local: this.golesLocal,
                visitante: this.golesVisitante,
            },
            equipos: {
                local: this.equipoLocalId,
                visitante: this.equipoVisitanteId,
            },
        };
    }
}

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

    const base = { salaId, localId: sockLocal.id, visitanteId: sockVisitante.id };
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
    });
}

export { FISICA, Pelota, Jugador, Partido };
