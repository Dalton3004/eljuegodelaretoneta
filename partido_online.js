/**
 * Liga Chaquito F8 — Partido EN LÍNEA (autoridad del servidor).
 *
 * Es el MISMO partido del modo offline (ver sim_offline.js): 3 jugadores de
 * campo + arquero por equipo, resistencia, barridas, colisiones, IA de los
 * compañeros y de los arqueros, preparación + cuenta regresiva, festejo de gol
 * y fin de partido. La única diferencia es que el equipo rival lo maneja una
 * segunda persona en lugar de la IA.
 *
 * Controles (idénticos al offline): WASD/flechas mover · SHIFT correr ·
 * ESPACIO cargar tiro / barrida · E pase · R pase largo · Q cambiar jugador.
 * Además, igual que offline, el control pasa solo al compañero que recibe la
 * pelota.
 */

import { cargarSimulacion } from "./sim_offline.js";

const SIM = cargarSimulacion();
const { CONFIG, DIFICULTADES, Jugador, Pelota, GestorPartido } = SIM;

export const TICK_HZ = CONFIG.TARGET_FPS;
const DT = 1 / TICK_HZ;

const TECLAS_VACIAS = () => ({ up: false, down: false, left: false, right: false, shift: false });
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Estado de teclas de una persona + órdenes puntuales pendientes de procesar. */
class Entrada {
    constructor() {
        this.keys = TECLAS_VACIAS();
        this.espacio = false;
        this.e = false;
        this.r = false;
        this.q = false;
        // Órdenes de un solo disparo (se consumen en el siguiente tick).
        this.espacioDown = false;
        this.espacioUp = false;
        this.pase = false;
        this.pases = 0;
        this.largo = false;
        this.cambio = false;
    }

    aplicar(data) {
        const espacio = !!(data.espacio || data.space);
        const e = !!(data.e || data.pase);
        const r = !!(data.r || data.largo);
        const q = !!(data.q || data.cambio);
        if (espacio && !this.espacio) this.espacioDown = true;
        if (!espacio && this.espacio) this.espacioUp = true;
        if (e && !this.e) this.pase = true;
        if (r && !this.r) this.largo = true;
        if (q && !this.q) this.cambio = true;
        this.espacio = espacio;
        this.e = e;
        this.r = r;
        this.q = q;
        this.keys = {
            up: !!(data.w || data.arriba),
            down: !!(data.s || data.abajo),
            left: !!(data.a || data.izquierda),
            right: !!(data.d || data.derecha),
            shift: !!(data.shift || data.sprint),
        };
    }

    consumir() {
        const o = {
            espacioDown: this.espacioDown,
            espacioUp: this.espacioUp,
            pase: this.pase,
            largo: this.largo,
            cambio: this.cambio,
        };
        this.espacioDown = this.espacioUp = this.pase = this.largo = this.cambio = false;
        return o;
    }
}

export class Partido {
    constructor(salaId, localId, visitanteId, equipoLocal, equipoVisitante) {
        const cx = CONFIG.WIDTH / 2;
        const cy = CONFIG.HEIGHT / 2;
        this.salaId = salaId;
        this.equipoLocalId = equipoLocal || "";
        this.equipoVisitanteId = equipoVisitante || "";
        this.tick = 0;
        this.rankingGuardado = false;

        // Misma formación que el offline (_initMatch). AZUL = local (abajo), ROJO = visitante (arriba).
        const local = [
            new Jugador(cx, 460, { team: "local", mobilityId: "local_0" }),
            new Jugador(cx - 64, 500, { team: "local", mobilityId: "local_1" }),
            new Jugador(cx + 64, 500, { team: "local", mobilityId: "local_2" }),
            new Jugador(cx, 545, { team: "local", isGK: true, mobilityId: "local_gk" }),
        ];
        const visitante = [
            new Jugador(cx, 180, { team: "rival", mobilityId: "rival_0" }),
            new Jugador(cx - 64, 140, { team: "rival", mobilityId: "rival_1" }),
            new Jugador(cx + 64, 140, { team: "rival", mobilityId: "rival_2" }),
            new Jugador(cx, 95, { team: "rival", isGK: true, mobilityId: "rival_gk" }),
        ];

        // Entre dos personas no puede haber un lado más rápido que otro: el
        // visitante usa las mismas velocidades que el local (en offline el
        // rival tiene números propios porque juega contra la persona).
        visitante.forEach((p, i) => {
            p.mobilityMultiplier = local[i].mobilityMultiplier;
            p.sprintMultiplier = local[i].sprintMultiplier;
        });
        // Ambos arqueros usan el perfil NORMAL (igual que el arquero del jugador en offline).
        // La IA de campo de ambos equipos usa el perfil base (igual que los compañeros en offline).
        for (const p of [...local, ...visitante]) {
            if (p.isGK) p.diff = DIFICULTADES.normal;
        }

        this.players = [...local, ...visitante];
        this.ball = new Pelota(cx, cy);
        this.gestor = new GestorPartido(this.ball, this.players);

        this.lados = {
            local: { socketId: localId, humano: null, entrada: new Entrada() },
            rival: { socketId: visitanteId, humano: null, entrada: new Entrada() },
        };
        this.porSocket = new Map([
            [localId, "local"],
            [visitanteId, "rival"],
        ]);
        this._asignarHumano("local", local[0]);
        this._asignarHumano("rival", visitante[0]);
    }

    // --- Compatibilidad con el resto del servidor -------------------------

    get estado() {
        return this.gestor.estado;
    }

    get golesLocal() {
        return this.gestor.golesLocal;
    }

    get golesVisitante() {
        return this.gestor.golesRival;
    }

    // --- Control de la persona --------------------------------------------

    aplicarInput(socketId, data) {
        const lado = this.porSocket.get(socketId);
        if (!lado || !data || typeof data !== "object") return;
        this.lados[lado].entrada.aplicar(data);
    }

    _campo(lado) {
        return this.players.filter((p) => p.team === lado && !p.isGK);
    }

    _asignarHumano(lado, jugador) {
        const L = this.lados[lado];
        const anterior = L.humano;
        if (anterior && anterior !== jugador) {
            anterior.isHuman = false;
            anterior.keys = TECLAS_VACIAS();
            anterior.shotCharging = false;
            anterior.shotCharge = 0;
        }
        jugador.isHuman = true;
        jugador.keys = TECLAS_VACIAS();
        L.humano = jugador;
    }

    /** Q: pasa al siguiente jugador de campo (igual que Game._switchPlayer). */
    _cambiarJugador(lado) {
        const lista = this._campo(lado);
        if (lista.length < 2) return;
        const i = lista.indexOf(this.lados[lado].humano);
        this._asignarHumano(lado, lista[(i + 1) % lista.length]);
    }

    /** El control pasa solo a quien recibe la pelota (igual que Game._syncActivePlayerToBall). */
    _seguirPelota(lado) {
        const dueno = this.ball.owner;
        if (!dueno || dueno.team !== lado || dueno.isGK || dueno === this.lados[lado].humano) return;
        this._asignarHumano(lado, dueno);
    }

    _aplicarEntradas() {
        const g = this.gestor;
        for (const lado of ["local", "rival"]) {
            const L = this.lados[lado];
            const h = L.humano;
            const o = L.entrada.consumir();
            h.keys = { ...L.entrada.keys };
            if (g.isPlaying()) {
                if (o.espacioDown) h.actionSpace(this.ball);
                if (o.cambio) this._cambiarJugador(lado);
                const activo = L.humano;
                if (o.pase) activo.actionPass(this.ball, this.players.filter((p) => p.team === lado && p !== activo));
                if (o.largo) activo.actionLongPass(this.ball);
            }
            if (o.espacioUp) L.humano.releaseShotCharge(this.ball);
        }
    }

    // --- Bucle -------------------------------------------------------------

    avanzar() {
        this.tick++;
        this._aplicarEntradas();
        this.gestor.update(DT);
        this._seguirPelota("local");
        this._seguirPelota("rival");
    }

    // --- Estado hacia los clientes ----------------------------------------

    snapshot() {
        const g = this.gestor;
        const ids = { local: this.lados.local.humano, rival: this.lados.rival.humano };
        return {
            salaId: this.salaId,
            tick: this.tick,
            estado: g.estado,
            segundos: Math.ceil(g.framesRestantes / TICK_HZ),
            prematch: redondear(g.prematchTimer),
            cuenta: g.countdownNumber,
            festejo: redondear(g.timerFestejo),
            pelota: {
                x: redondear(this.ball.pos.x),
                y: redondear(this.ball.pos.y),
                vx: redondear(this.ball.vel.x),
                vy: redondear(this.ball.vel.y),
            },
            jugadores: this.players.map((p) => {
                const lado = p.team;
                const j = {
                    rol: lado === "local" ? "Local" : "Visitante",
                    id: ids[lado] === p ? this.lados[lado].socketId : "",
                    x: redondear(p.pos.x),
                    y: redondear(p.pos.y),
                    vx: redondear(p.vel.x),
                    vy: redondear(p.vel.y),
                    dirX: redondear(p.facing.x),
                    dirY: redondear(p.facing.y),
                };
                if (p.isGK) j.gk = 1;
                if (p.hasBall) j.tienePelota = true;
                if (p.isSliding) j.deslizando = true;
                if (p.sprinting) j.sprint = true;
                if (p.slideTimer > 0) j.sl = redondear(p.slideTimer);
                if (p.kickTimer > 0) j.kt = redondear(p.kickTimer);
                if (p.hitStun > 0) j.hs = redondear(p.hitStun);
                if (p.hitSlow > 0) j.hw = redondear(p.hitSlow);
                if (p.hitFlash > 0) j.hf = redondear(p.hitFlash);
                if (p.hitSquash > 0) j.hq = redondear(p.hitSquash);
                if (p.shotCharging) {
                    j.cg = 1;
                    j.cc = redondear(p.shotCharge);
                }
                if (!p.isGK) j.st = Math.round(p.stamina);
                if (p.isGK) {
                    j.ga = p.gkAction;
                    j.gt = redondear(p.gkActionTimer);
                    j.gd = p.gkDiveDir || 0;
                }
                return j;
            }),
            marcador: {
                local: g.golesLocal,
                visitante: g.golesRival,
            },
            equipos: {
                local: this.equipoLocalId,
                visitante: this.equipoVisitanteId,
            },
        };
    }
}
