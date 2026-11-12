/**
 * Liga Chaquito F8 - Capa de animaciones y "game feel" (FX)
 *
 * Esta capa SOLO MIRA el estado del juego (posición, velocidad, acciones de cada jugador) y
 * dibuja encima: nunca cambia posiciones, pelota, puntaje ni IA. Por eso no puede alterar cómo
 * se juega. Si algo falla, se apaga sola y el juego sigue como antes (ver _fail).
 *
 * Qué agrega:
 *  - Carrera con rebote, inclinación hacia donde corre / acelera, y cansancio visible.
 *  - Patada y pase con estirón elástico, carga de tiro (se agacha y tiembla), control de pelota.
 *  - Frenada con derrape, quiebre de dirección, barrida con polvo y levantarse.
 *  - Parado: respira, mira la jugada (IA) y hace tics propios (saltito, estirarse, sacudirse).
 *  - Arquero: balanceo en la línea, estirada con polvo, queda tendido al recibir un gol.
 *  - Festejo de gol por jugador (salto, giro, baile, puños, rodillas) y lamento del rival.
 *  - Fin de partido: ganadores festejan, perdedores se desinflan.
 *  - Partículas (polvo, pasto, sudor, estrellas, confeti), sacudida de pantalla, estela y giro de pelota.
 *
 * Configuración por jugador: assets/animaciones.js (lo genera tools/configurar_animaciones.py).
 */
(function (global) {
    'use strict';

    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

    // Generador propio: NO usa Math.random para no alterar la secuencia aleatoria del partido.
    function makeRng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
        return h;
    }

    const GLOBAL_DEF = { intensidad: 1, sacudida: 1, particulas: 1, estela: true, festejos: true };
    const PLAYER_DEF = { festejo: 'salto', estilo: 'normal', nervio: 1, rebote: 1, inclinacion: 1, respiracion: 1 };
    const ESTILOS = {
        normal:   { bob: 1.0,  lean: 1.0,  squash: 1.0,  stride: 1.0 },
        elastico: { bob: 1.3,  lean: 0.9,  squash: 1.25, stride: 1.1 },
        pesado:   { bob: 0.8,  lean: 1.25, squash: 0.8,  stride: 0.9 },
        ligero:   { bob: 1.1,  lean: 0.8,  squash: 1.0,  stride: 1.15 }
    };

    const FALLBACK_CURVES = {
        salto:   t => Math.max(0, 1 - Math.pow(2 * t - 1, 2)),
        rebote:  t => Math.cos(t * TAU * 2.2) * Math.exp(-4.2 * t),
        asentar: t => Math.cos(t * TAU * 1.4) * Math.exp(-5 * t),
        pulso:   t => Math.sin(Math.PI * t)
    };

    function userCfg() { return (global.ANIMACIONES && typeof global.ANIMACIONES === 'object') ? global.ANIMACIONES : {}; }

    function sampleCurve(name, t) {
        t = clamp(t, 0, 1);
        const arr = userCfg().curvas && userCfg().curvas[name];
        if (Array.isArray(arr) && arr.length > 1) {
            const x = t * (arr.length - 1);
            const i = Math.floor(x), f = x - i;
            const a = arr[i], b = arr[Math.min(arr.length - 1, i + 1)];
            return a + (b - a) * f;
        }
        return FALLBACK_CURVES[name](t);
    }

    const STAMINA_MAX = () => (typeof CONFIG !== 'undefined' && CONFIG.STAMINA_MAX) || 100;

    function neutral() {
        return { sx: 1, sy: 1, dx: 0, dy: 0, angle: 0, bobMul: 1, shadow: 1,
                 frameName: null, slide: null, view: null, flipToggle: false };
    }

    // Resorte amortiguado para suavizar la inclinación
    function spring(s, target, k, c, dt) {
        const a = -k * (s.x - target) - c * s.v;
        s.v += a * dt;
        s.x += s.v * dt;
    }

    // ================================================================
    // Estado de animación de UN jugador (solo lectura sobre el Jugador)
    // ================================================================
    class EstadoJugador {
        constructor(p, world, index) {
            this.p = p;
            this.W = world;
            this.id = p.mobilityId || ('p' + index);
            this.cfg = Object.assign({}, PLAYER_DEF, (userCfg().jugadores || {})[this.id] || {});
            this.estilo = ESTILOS[this.cfg.estilo] || ESTILOS.normal;
            this.rng = makeRng(hashStr(this.id) + 17);
            this.t = this.rng() * 10;
            this.phase = this.rng() * TAU;
            this.index = index;

            this.lean = { x: 0, v: 0 };
            this.tm = { kick: 0, trap: 0, cut: 0, skid: 0, getup: 0, fidget: 0, pop: 0, pivot: 0, burst: 0, ready: 0 };
            this.du = { kick: 0.30, trap: 0.26, cut: 0.22, skid: 0.26, getup: 0.40, fidget: 0.60, pop: 0.32, pivot: 0.14, burst: 0.28, ready: 0.45 };
            this.readyPending = false;
            this.readyWait = 0;
            this.ampKick = 1;
            this.dirKick = { x: 0, y: -1 };
            this.cutDir = 1;
            this.skidDir = 1;
            this.fidgetType = 'saltito';
            this.nextFidget = 2 + this.rng() * 4;
            this.nextDribble = 0.18 + this.rng() * 0.16;
            this.prevFacing = { x: p.facing.x, y: p.facing.y };
            this.prevHasBall = !!p.hasBall;
            this.prev = { kick: 0, hasBall: false, human: false, slide: false, gk: 'stand', speed: 0, vx: 0, vy: 0, c: 1, sprint: false, charging: false };
            this.view = null;
            this.slideDust = 0;
            this.sweatT = 0.5 + this.rng() * 0.5;
            this.starT = 0;
            this.delay = 0;
            this.slideDir = 1;
            this.slideDist = 0;
            this.lyingDone = false;
            this.pose = neutral();
        }

        onMode() {
            const p = this.p;
            this.prev.speed = 0; this.prev.vx = 0; this.prev.vy = 0; this.prev.c = 1;
            this.prev.kick = p.kickTimer || 0;
            this.prev.slide = !!p.isSliding;
            this.prev.hasBall = !!p.hasBall;
            this.delay = 0.10 + (this.index % 5) * 0.08;
            this.lyingDone = false;
            this.starT = 0;
            for (const k in this.tm) this.tm[k] = 0;
            const W = this.W;
            this.prev.sprint = false;
            this.prev.charging = false;
            // Al reanudar el juego tras un gol, cada jugador da un saltito de "listos" (escalonado)
            this.readyPending = W.mode === 'juego';
            this.readyWait = (this.index % 5) * 0.07;
            if (W.mode === 'gol' && p === W.celeb.scorer) {
                this.slideDir = p.pos.x < (typeof CONFIG !== 'undefined' ? CONFIG.WIDTH / 2 : 240) ? 1 : -1;
                const F = (typeof CONFIG !== 'undefined') ? CONFIG.FIELD : { LEFT: 78, RIGHT: 402 };
                const room = this.slideDir > 0 ? (F.RIGHT - 16 - p.pos.x) : (p.pos.x - (F.LEFT + 16));
                this.slideDist = clamp(room, 0, 38);
            }
        }

        // ---------------- eventos puntuales ----------------
        _events(dt, speed, moving) {
            const p = this.p, W = this.W, pr = this.prev;
            const jugando = W.mode === 'juego' && !p.frozen;

            // Patada / pase
            if (p.kickTimer > pr.kick + 0.002 && jugando) {
                const b = W.ball;
                const bs = b ? b.vel.length() : 0;
                const esTiro = pr.charging;               // venía cargando el tiro = es un tiro; si no, un pase
                const fuerte = esTiro && bs >= 9;
                this.ampKick = esTiro ? clamp(0.5 + bs / 12, 0.6, 1.5) : clamp(0.7 + bs / 30, 0.7, 1.15);
                this.tm.kick = this.du.kick;
                this.dirKick = { x: p.facing.x, y: p.facing.y };
                W.dust(p.pos.x + p.facing.x * 8, p.pos.y + 2 + p.facing.y * 4, fuerte ? 5 : 2, 1.2, 3);
                if (fuerte && b) { W.shake(1.6); W.sparks(b.pos.x, b.pos.y, 6); }
                else if (!esTiro && b && bs > 9) W.sparks(b.pos.x, b.pos.y, 3);   // pase fuerte: chispitas
            }
            pr.kick = p.kickTimer;
            pr.charging = !!p.shotCharging;

            // Arranque explosivo: al empezar a esprintar
            if (p.sprinting && !pr.sprint && jugando && speed > 0.8 && !p.isGK) {
                this.tm.burst = this.du.burst;
                W.dust(p.pos.x - p.vel.x * 2, p.pos.y + 4, 3, 1.2, 3);
            }
            pr.sprint = !!p.sprinting;

            // Control de pelota
            if (p.hasBall && !pr.hasBall && jugando) this.tm.trap = this.du.trap;
            pr.hasBall = p.hasBall;

            // Jugador activo (el indicador salta a este jugador)
            if (p.isHuman && !pr.human) this.tm.pop = this.du.pop;
            pr.human = p.isHuman;

            // Toques de conducción: pequeñas acciones visuales sincronizadas con la pelota.
            // Son exclusivamente de render; no cambian la física ni la posición real.
            if (jugando && p.hasBall && moving && !p.isGK) {
                this.nextDribble -= dt;
                if (this.nextDribble <= 0 && this.tm.dribble <= 0) {
                    this.tm.dribble = this.du.dribble;
                    this.nextDribble = (p.sprinting ? 0.20 : 0.26) + this.rng() * 0.10;
                }
            } else {
                this.nextDribble = Math.max(this.nextDribble, 0.10);
            }

            // Protección de pelota: al llevarla y desacelerar, el cuerpo acompaña el giro.
            if (jugando && p.hasBall && !p.isGK && speed > 0.45 && speed < 2.0 && this.tm.shield <= 0) {
                this.tm.shield = this.du.shield;
            }

            // Tropezón visual muy corto ante un impacto fuerte. No modifica velocidad ni física.
            if (jugando && (p.hitSquash || 0) > 0.105 && this.tm.stumble <= 0) {
                this.tm.stumble = this.du.stumble;
            }

            // Giro visual: cuando cambia claramente de dirección, suaviza la transición de postura.
            if (jugando && speed > 0.7 && this.prev.speed > 0.7) {
                const dot = (p.vel.x * this.prev.vx + p.vel.y * this.prev.vy) / (speed * this.prev.speed);
                if (dot < 0.35 && this.tm.turn <= 0) this.tm.turn = this.du.turn;
            }

            // Barrida
            if (p.isSliding && !pr.slide) { this.slideDust = 0; W.dust(p.pos.x, p.pos.y + 3, 4, 1.5, 3.5); }
            if (!p.isSliding && pr.slide && jugando) this.tm.getup = this.du.getup;
            if (p.isSliding) {
                this.slideDust -= dt;
                if (this.slideDust <= 0) {
                    this.slideDust = 0.04;
                    W.dust(p.pos.x - p.facing.x * 10, p.pos.y + 4, 1, 0.8, 3);
                }
            }
            pr.slide = p.isSliding;

            // Frenada brusca / quiebre de dirección
            if (jugando && !p.isSliding) {
                const pv = pr.speed;
                if (pv > 2.0 && speed < pv * 0.45) {
                    this.tm.skid = this.du.skid;
                    this.skidDir = Math.sign(pr.vx) || 1;
                    W.dust(p.pos.x - pr.vx * 2, p.pos.y + 4, 3, 1.4, 3);
                } else if (speed > 1.6 && pv > 1.6 && this.tm.cut <= 0) {
                    const dot = (p.vel.x * pr.vx + p.vel.y * pr.vy) / (speed * pv);
                    if (dot < 0.25) {
                        this.tm.cut = this.du.cut;
                        this.cutDir = Math.sign(p.vel.x - pr.vx) || 1;
                        W.dust(p.pos.x, p.pos.y + 4, 2, 1.0, 2.6);
                    }
                }
            }

            // Arquero
            if (p.isGK && p.gkAction !== pr.gk) {
                if (typeof p.gkAction === 'string' && p.gkAction.startsWith('dive') && jugando) W.dust(p.pos.x, p.pos.y + 4, 6, 2.2, 4);
                if (p.gkAction === 'catch' && jugando) { this.tm.trap = this.du.trap; W.shake(0.9); }
                pr.gk = p.gkAction;
            }

            // Pisadas al correr
            if (moving && !p.isGK && jugando) {
                const c = Math.abs(Math.sin(p.animClock * (p.sprinting ? 22 : 15)));
                if (c < 0.22 && pr.c >= 0.22 && speed > 1.2) {
                    W.dust(p.pos.x - p.vel.x * 1.5, p.pos.y + 5, p.sprinting ? 2 : 1, 0.6, 2.2);
                    if (p.sprinting && this.rng() < 0.25) W.grass(p.pos.x, p.pos.y + 4, 2);
                }
                pr.c = c;
            } else pr.c = 1;
        }

        // ---------------- actualización por frame ----------------
        update(dt) {
            const p = this.p, W = this.W;
            this.t += dt;
            const speed = p.vel.length();
            const moving = speed > 0.3 && !p.isSliding;

            this._events(dt, speed, moving);
            for (const k in this.tm) if (this.tm[k] > 0) this.tm[k] = Math.max(0, this.tm[k] - dt);
            if (this.readyPending) {
                this.readyWait -= dt;
                if (this.readyWait <= 0) { this.readyPending = false; this.tm.ready = this.du.ready; }
            }

            const A = W.G.intensidad * W.calma;
            const pose = neutral();
            if (W.mode === 'juego') this._poseJuego(pose, dt, speed, moving, A);
            else this._poseFestejo(pose, dt, A);

            // Límites de seguridad: nunca deformar al jugador de forma exagerada
            const sgn = pose.sx < 0 ? -1 : 1;
            pose.sx = sgn * clamp(Math.abs(pose.sx), 0.1, 1.4);
            pose.sy = clamp(pose.sy, 0.6, 1.4);
            pose.angle = clamp(pose.angle, -0.6, 0.6);
            pose.dx = clamp(pose.dx, -45, 45);
            pose.dy = clamp(pose.dy, -30, 12);
            pose.shadow *= 1 - clamp(-pose.dy / 18, 0, 0.4);
            pose.shadow = clamp(pose.shadow, 0.4, 1);
            this.pose = pose;

            this.prev.speed = speed; this.prev.vx = p.vel.x; this.prev.vy = p.vel.y;
        }

        _poseJuego(pose, dt, speed, moving, A) {
            const p = this.p, W = this.W, cfg = this.cfg, st = this.estilo;
            const isGK = p.isGK;
            const fatigue = isGK ? 0 : clamp(1 - p.stamina / STAMINA_MAX(), 0, 1);
            let leanT = 0;

            if (moving) {
                const sprint = p.sprinting ? 1 : 0;
                const ph = p.animClock * (sprint ? 22 : 15);
                const c = Math.abs(Math.sin(ph));            // 0 = pie en el piso, 1 = en el aire
                const s = (0.030 + 0.020 * sprint) * st.squash * A * (1 - 0.4 * fatigue);
                pose.sy *= 1 + s * (2 * c - 1);
                pose.sx *= 1 - s * 0.6 * (2 * c - 1);
                leanT = clamp(p.vel.x / 3.0, -1, 1) * (0.05 + 0.04 * sprint) * st.lean * cfg.inclinacion * A;
                leanT += clamp((p.vel.x - this.prev.vx) * 0.25, -0.08, 0.08) * A;
                pose.angle += Math.sin(ph * 0.5 + this.phase) * 0.018 * st.stride * A;
                pose.bobMul = st.bob * (1 - 0.35 * fatigue);
                if (fatigue > 0.5) {
                    pose.sy *= 1 - 0.035 * fatigue;
                    leanT += (p.vel.x >= 0 ? 1 : -1) * 0.04 * fatigue;
                }
                if (p.hasBall) pose.sy *= 0.985;
            } else {
                const resp = (0.010 + 0.030 * fatigue) * cfg.respiracion * A;
                const w = 2.2 + fatigue * 4.5;
                const br = Math.sin(this.t * w + this.phase) * resp;
                pose.sy *= 1 + br;
                pose.sx *= 1 - br * 0.6;
                // Muy cansado y parado: se encorva con las manos en las rodillas
                if (fatigue > 0.5) {
                    pose.sy *= 1 - 0.045 * fatigue * A;
                    pose.angle += (p.facing.x >= 0 ? 1 : -1) * 0.05 * fatigue * A;
                }
                this._fidget(pose, dt, A);
            }
            if (moving && this.tm.fidget > 0) this.tm.fidget = 0;

            // Sudor cuando está muy cansado
            if (fatigue > 0.55 && !isGK) {
                this.sweatT -= dt;
                if (this.sweatT <= 0) {
                    this.sweatT = 0.45 + this.rng() * 0.4;
                    W.sweat(p.pos.x + (this.rng() - 0.5) * 8, p.pos.y - 48);
                }
            }

            // Conducción: dos microfases de toque para que el jugador no parezca deslizarse
            // rígidamente cuando lleva la pelota. La amplitud es deliberadamente pequeña.
            if (this.tm.dribble > 0) {
                const k = 1 - this.tm.dribble / this.du.dribble;
                const pulse = Math.sin(Math.PI * k);
                const side = Math.sin(k * TAU);
                pose.dy -= 0.9 * pulse * A;
                pose.angle += side * 0.035 * A * cfg.inclinacion;
                pose.sx *= 1 + 0.025 * pulse * A;
                pose.sy *= 1 - 0.018 * pulse * A;
            }

            // Protección de pelota: hombro/cadera ligeramente adelantados.
            if (this.tm.shield > 0 && p.hasBall) {
                const k = 1 - this.tm.shield / this.du.shield;
                const pulse = sampleCurve('pulso', k);
                const sign = p.facing.x >= 0 ? 1 : -1;
                pose.angle += sign * 0.055 * pulse * cfg.inclinacion * A;
                pose.dx += p.facing.x * 0.7 * pulse * A;
                pose.sx *= 1 + 0.018 * pulse * A;
            }

            // Tropezón de recuperación: pequeño contrapeso y asentamiento, sin tocar la física.
            if (this.tm.stumble > 0) {
                const k = 1 - this.tm.stumble / this.du.stumble;
                const v = sampleCurve('asentar', k);
                pose.angle += (p.vel.x >= 0 ? 1 : -1) * 0.075 * v * A;
                pose.sy *= 1 - 0.025 * Math.abs(v) * A;
                pose.dy += 1.2 * Math.max(0, v) * A;
            }

            // Giro: el torso anticipa la dirección antes de volver al centro.
            if (this.tm.turn > 0) {
                const k = 1 - this.tm.turn / this.du.turn;
                const v = sampleCurve('pulso', k);
                const sign = Math.sign(p.vel.x - this.prev.vx) || 1;
                pose.angle += sign * 0.10 * v * cfg.inclinacion * A;
                pose.sx *= 1 - 0.025 * v * A;
            }

            // Golpes de animación
            if (this.tm.kick > 0) {
                const k = 1 - this.tm.kick / this.du.kick;
                const v = sampleCurve('rebote', k) * this.ampKick * A * cfg.rebote;
                const pu = sampleCurve('pulso', k) * this.ampKick * A;
                pose.sy *= 1 + 0.13 * v;
                pose.sx *= 1 - 0.09 * v;
                pose.angle += (this.dirKick.x >= 0 ? 1 : -1) * 0.10 * pu * (Math.abs(this.dirKick.x) > 0.3 ? 1 : 0.3);
                pose.dx += this.dirKick.x * 2.2 * pu;
            }
            if (this.tm.trap > 0) {
                const k = 1 - this.tm.trap / this.du.trap;
                const v = sampleCurve('asentar', k) * A * cfg.rebote;
                pose.sy *= 1 - 0.10 * v;
                pose.sx *= 1 + 0.07 * v;
            }
            if (this.tm.cut > 0) {
                const k = 1 - this.tm.cut / this.du.cut;
                pose.angle += this.cutDir * 0.16 * sampleCurve('pulso', k) * A * cfg.inclinacion;
            }
            if (this.tm.skid > 0) {
                const k = 1 - this.tm.skid / this.du.skid;
                const pu = sampleCurve('pulso', k) * A;
                pose.angle += -this.skidDir * 0.14 * pu * cfg.inclinacion;
                pose.sy *= 1 - 0.03 * pu;
            }
            if (this.tm.getup > 0) {
                const k = 1 - this.tm.getup / this.du.getup;
                const v = sampleCurve('salto', k) * A;
                pose.dy -= 5 * v;
                pose.sy *= 1 + 0.06 * v;
            }
            if (this.tm.burst > 0) {
                const k = 1 - this.tm.burst / this.du.burst;
                const pu = sampleCurve('pulso', k) * A;
                pose.angle += (p.vel.x >= 0 ? 1 : -1) * 0.12 * pu * cfg.inclinacion;
                pose.sy *= 1 - 0.05 * pu;
                pose.sx *= 1 + 0.04 * pu;
            }
            if (this.tm.ready > 0) {
                const k = 1 - this.tm.ready / this.du.ready;
                pose.dy -= 3.5 * sampleCurve('salto', k) * A;
            }
            if (this.tm.pop > 0) {
                const k = 1 - this.tm.pop / this.du.pop;
                const v = sampleCurve('pulso', k) * A;
                pose.sx *= 1 + 0.08 * v;
                pose.sy *= 1 + 0.08 * v;
            }
            if (this.tm.pivot > 0) {
                const k = 1 - this.tm.pivot / this.du.pivot;
                pose.sx *= 1 - 0.12 * sampleCurve('pulso', k) * A;
            }
            // Carga de tiro: se agacha y, al máximo, tiembla
            if (p.shotCharging && p.shotChargeMax > 0) {
                const c = clamp(p.shotCharge / p.shotChargeMax, 0, 1);
                pose.sy *= 1 - 0.12 * c * A;
                pose.sx *= 1 + 0.07 * c * A;
                if (c > 0.92) pose.dx += Math.sin(this.t * 70) * 0.7 * A;
            }
            // Arquero: balanceo sobre la línea y mirada hacia la pelota
            if (isGK && !(typeof p.gkAction === 'string' && (p.gkAction.startsWith('dive') || p.gkAction === 'catch'))) {
                pose.dx += Math.sin(this.t * 1.9 + this.phase) * 1.2 * A;
                const b = W.ball;
                if (b) leanT += clamp((b.pos.x - p.pos.x) / 220, -1, 1) * 0.05 * A;
            }

            spring(this.lean, leanT, 160, 16, dt);
            this.lean.x = clamp(this.lean.x, -0.3, 0.3);
            pose.angle += this.lean.x;

            this._updateView(pose, moving);
        }

        _fidget(pose, dt, A) {
            if (this.p.isSliding) return;
            this.nextFidget -= dt;
            if (this.nextFidget <= 0 && this.tm.fidget <= 0) {
                const tipos = ['saltito', 'estirar', 'sacudir', 'mirar'];
                const o = this.W.ball ? this.W.ball.owner : null;
                // Si un compañero tiene la pelota, a veces la pide dando saltitos
                if (o && o !== this.p && o.team === this.p.team && !this.p.isGK) tipos.push('pedir', 'pedir');
                this.fidgetType = tipos[Math.floor(this.rng() * tipos.length)];
                this.tm.fidget = this.du.fidget;
                this.nextFidget = (3.2 + this.rng() * 4.5) / this.cfg.nervio;
            }
            if (this.tm.fidget > 0) {
                const k = 1 - this.tm.fidget / this.du.fidget;
                switch (this.fidgetType) {
                    case 'saltito': pose.dy -= 4.5 * sampleCurve('salto', k) * A; break;
                    case 'estirar': {
                        const v = Math.sin(Math.PI * k);
                        pose.sy *= 1 + 0.05 * v * A;
                        pose.sx *= 1 - 0.03 * v * A;
                        break;
                    }
                    case 'sacudir': pose.angle += Math.sin(k * TAU * 3) * 0.06 * (1 - k) * A; break;
                    case 'mirar': if (k > 0.35 && k < 0.7) pose.flipToggle = true; break;
                    case 'pedir':
                        pose.dy -= 4 * Math.abs(Math.sin(k * TAU)) * A;
                        pose.angle += Math.sin(k * TAU * 2) * 0.05 * A;
                        break;
                }
            }
        }

        // La IA parada mira hacia la pelota (solo dibujo: no cambia hacia dónde "mira" para el juego)
        _updateView(pose, moving) {
            const p = this.p, W = this.W, b = W.ball;
            if (!moving && !p.isHuman && !p.isGK && !p.isSliding && !(p.kickTimer > 0) && !p.frozen && b) {
                const dx = b.pos.x - p.pos.x, dy = b.pos.y - p.pos.y;
                const ax = Math.abs(dx), ay = Math.abs(dy);
                let dir = this.view ? this.view.dir : p.animDir;
                if (dir === 'side') { if (ay > ax * 1.5) dir = dy < 0 ? 'up' : 'down'; }
                else if (ax > ay * 1.5) dir = 'side';
                else if (ay > 0.01) dir = dy < 0 ? 'up' : 'down';
                const flip = dir === 'side' ? (ax > 2 ? dx < 0 : (this.view ? this.view.flip : !!p.flipX)) : false;
                if (this.view && this.view.dir !== dir) this.tm.pivot = this.du.pivot;
                this.view = { dir, flip };
            } else this.view = null;
            pose.view = this.view;
        }

        // ---------------- festejo / lamento ----------------
        _poseFestejo(pose, dt, A) {
            const p = this.p, W = this.W, cfg = this.cfg;
            const role = W.G.festejos ? W.roleOf(p) : 'neutral';
            const ct = W.modeT - this.delay;
            const br = Math.sin(this.t * 2.2 + this.phase) * 0.012 * cfg.respiracion * A;
            pose.sy *= 1 + br; pose.sx *= 1 - br * 0.6;
            if (ct < 0 || role === 'neutral') return;

            if (role === 'tristeza') {
                const k = smooth(ct / 0.5);
                pose.sy *= 1 - 0.05 * k * A;
                pose.sx *= 1 + 0.03 * k * A;
                pose.dy += 1.2 * k;
                pose.angle += (p.facing.x >= 0 ? 1 : -1) * 0.05 * k * A + Math.sin(ct * 2.3 + this.phase) * 0.02 * k;
                pose.dx += Math.sin(ct * 1.1 + this.phase) * 0.6 * k;
                if (p.isGK && W.mode === 'gol' && ct > 0.35) {
                    pose.frameName = 'GK_lying';
                    pose.sx = 1; pose.sy = 1; pose.angle = 0; pose.dx = 0; pose.dy = 0;
                    if (!this.lyingDone) { this.lyingDone = true; W.dust(p.pos.x, p.pos.y + 4, 6, 2.0, 4); W.shake(1.2); }
                }
                return;
            }

            // alegría (goleador con más energía)
            const gol = role === 'goleador';
            const K = (gol ? 1.25 : 1) * A;
            let style = cfg.festejo;
            let t2 = ct;

            if (gol && W.mode === 'gol' && style === 'rodillas') {
                const T = 0.7;
                if (ct < T) {
                    const prog = ct / T;
                    pose.slide = { prog, dir: this.slideDir };
                    pose.dx = this.slideDir * this.slideDist * easeOut(prog);
                    pose.angle = 0;
                    pose.bobMul = 0;
                    this.slideDust -= dt;
                    if (this.slideDust <= 0) { this.slideDust = 0.04; W.dust(p.pos.x + pose.dx - this.slideDir * 10, p.pos.y + 4, 1, 0.9, 3); }
                    return;
                }
                pose.dx = this.slideDir * this.slideDist;
                t2 = ct - T;
                style = 'punos';
            } else if (style === 'rodillas') style = 'punos';

            switch (style) {
                case 'giro': {
                    const fr = (t2 / 0.7) % 1;
                    const h = sampleCurve('salto', fr);
                    pose.dy -= 13 * h * K;
                    const c = Math.cos(fr * TAU);
                    pose.sx *= Math.abs(c) < 0.12 ? (c < 0 ? -0.12 : 0.12) : c;
                    pose.shadow *= 1 - 0.3 * h;
                    break;
                }
                case 'baile': {
                    const w = t2 * 7.5 + this.phase;
                    pose.dx += Math.sin(w) * 4.5 * K;
                    pose.dy -= Math.abs(Math.sin(w)) * 5 * K;
                    pose.angle += Math.cos(w) * 0.13 * K;
                    break;
                }
                case 'punos': {
                    const w = t2 * 9;
                    const pu = Math.abs(Math.sin(w));
                    pose.dy -= 6 * pu * K;
                    pose.sy *= 1 + 0.07 * pu * K;
                    pose.sx *= 1 - 0.04 * pu * K;
                    pose.angle += -0.05 + Math.sin(w) * 0.05 * K;
                    break;
                }
                default: {   // salto
                    const fr = (t2 / 0.62) % 1;
                    const h = sampleCurve('salto', fr);
                    pose.dy -= 15 * h * K;
                    pose.sy *= 1 + 0.08 * h * K;
                    if (fr < 0.2) pose.sy *= 1 - 0.07 * sampleCurve('asentar', fr / 0.2) * K * cfg.rebote;
                    pose.shadow *= 1 - 0.3 * h;
                }
            }

            // Estrellitas sobre el goleador
            if (gol && W.mode === 'gol' && ct < 1.8) {
                this.starT -= dt;
                if (this.starT <= 0) { this.starT = 0.22; W.star(p.pos.x + (this.rng() - 0.5) * 20, p.pos.y - 58); }
            }
        }
    }

    // ================================================================
    // Mundo: partículas, sacudida, estela, giro de pelota, modos
    // ================================================================
    const CONFETTI = ['#ffcc00', '#ff4d4d', '#38a9e8', '#ffffff', '#4fd36a'];

    class Mundo {
        constructor(game) {
            this.game = game;
            this.enabled = true;
            this.errors = 0;
            this.rng = makeRng(20260110);
            this.calma = 1;
            try {
                if (typeof global.matchMedia === 'function' && global.matchMedia('(prefers-reduced-motion: reduce)').matches) this.calma = 0.5;
            } catch (e) { /* sin matchMedia */ }
            this.reset();
        }

        get G() { return Object.assign({}, GLOBAL_DEF, userCfg().global || {}); }

        reset() {
            this.parts = [];
            this.states = new Map();
            this.mode = 'juego';
            this.modeT = 0;
            this.celeb = { team: null, scorer: null };
            this.shakeAmp = 0;
            this.ballSpin = 0;
            this.trail = [];
            this.gestorRef = null;
            this.lastOwner = null;
            this.prevGoles = [0, 0];
            this.confettiT = 0;
        }

        _fail(e) {
            this.errors++;
            if (typeof console !== 'undefined' && console.warn) console.warn('[FX] error, se desactivan los efectos:', e);
            if (this.errors >= 3) { this.enabled = false; this.states.clear(); this.parts.length = 0; }
        }

        // ---------- ciclo ----------
        update(dt) {
            if (!this.enabled) return;
            try { this._update(dt); } catch (e) { this._fail(e); }
        }

        _update(dt) {
            const g = this.game, ge = g.gestor;
            if (!ge) return;
            if (this.gestorRef !== ge) {
                this.reset();
                this.gestorRef = ge;
                this.prevGoles = [ge.golesLocal, ge.golesRival];
            }
            const modo = ge.estado === 'CELEBRANDO_GOL' ? 'gol' : (ge.estado === 'FINALIZADO' ? 'fin' : 'juego');
            const newMode = modo !== this.mode;
            if (newMode) this._setMode(modo, ge);
            this.modeT += dt;

            const b = g.ball;
            if (b && b.owner) this.lastOwner = b.owner;

            g.players.forEach((p, i) => {
                let st = this.states.get(p);
                if (!st) { st = new EstadoJugador(p, this, i); this.states.set(p, st); }
                if (newMode) st.onMode();
                st.update(dt);
            });

            if (this.mode === 'gol' && this.confettiT > 0) {
                this.confettiT -= dt;
                if (this.G.particulas > 0) {
                    const W = typeof CONFIG !== 'undefined' ? CONFIG.WIDTH : 480;
                    this.confetti(60 + this.rng() * (W - 120), 50, 1);
                    if (this.rng() < 0.6) this.confetti(60 + this.rng() * (W - 120), 50, 1);
                }
            }

            this._updateBall(dt, b);
            this._updateParts(dt);
            this.shakeAmp *= Math.exp(-dt * 9);
            if (this.shakeAmp < 0.02) this.shakeAmp = 0;
        }

        _setMode(modo, ge) {
            this.mode = modo;
            this.modeT = 0;
            const g = this.game;
            if (modo === 'gol') {
                const local = ge.golesLocal > this.prevGoles[0];
                const team = local ? 'local' : 'rival';
                let scorer = (this.lastOwner && this.lastOwner.team === team && !this.lastOwner.isGK) ? this.lastOwner : null;
                if (!scorer && g.ball) {
                    let best = Infinity;
                    for (const p of g.players) {
                        if (p.team !== team || p.isGK) continue;
                        const d = p.pos.distanceTo(g.ball.pos);
                        if (d < best) { best = d; scorer = p; }
                    }
                }
                this.celeb = { team, scorer };
                const goal = local ? CONFIG.GOAL_NORTH : CONFIG.GOAL_SOUTH;
                const gx = goal.x + goal.w / 2, gy = goal.lineY;
                this.shake(7);
                for (let i = 0; i < 14; i++) this.star(gx + (this.rng() - 0.5) * goal.w, gy, (this.rng() - 0.5) * 140, (local ? 1 : -1) * (30 + this.rng() * 80));
                this.ring(gx, gy, 46);
                this.confettiT = 1.6;
                // La hinchada festeja: los del equipo propio todos, los del rival solo una parte
                if (g.hinchada) g.hinchada.goal(local ? 'north' : 'south', { fraction: local ? 1 : 0.5, duration: 2.8 + 1.2 });
            } else if (modo === 'fin') {
                const l = ge.golesLocal, r = ge.golesRival;
                this.celeb = { team: l > r ? 'local' : (r > l ? 'rival' : null), scorer: null };
            } else {
                this.celeb = { team: null, scorer: null };
            }
            this.prevGoles = [ge.golesLocal, ge.golesRival];
        }

        roleOf(p) {
            const c = this.celeb;
            if (!c || !c.team) return 'neutral';
            if (p === c.scorer) return 'goleador';
            return p.team === c.team ? 'alegria' : 'tristeza';
        }

        get ball() { return this.game.ball; }

        _updateBall(dt, b) {
            if (!b) return;
            const k = dt * 60;
            const sp = b.vel.length();
            if (b.owner) this.ballSpin += b.owner.vel.length() * 0.035 * (b.owner.facing.x >= 0 ? 1 : -1) * k;
            else this.ballSpin += sp * 0.05 * (b.vel.x >= 0 ? 1 : -1) * k;
            this.ballSpin %= TAU;

            for (const q of this.trail) q.a -= dt * 5;
            this.trail = this.trail.filter(q => q.a > 0);
            if (this.G.estela && !b.owner && sp > 6.5 && this.mode === 'juego') {
                this.trail.push({ x: b.pos.x, y: b.pos.y, a: 1, hot: sp > 9 });
                if (this.trail.length > 14) this.trail.shift();
            }
        }

        // ---------- emisores de partículas ----------
        _n(n) {
            const v = n * this.G.particulas * this.calma;
            return Math.floor(v) + (this.rng() < (v % 1) ? 1 : 0);
        }
        _push(q) {
            this.parts.push(q);
            if (this.parts.length > 240) this.parts.splice(0, this.parts.length - 240);
        }
        shake(a) { this.shakeAmp = Math.min(10, Math.max(this.shakeAmp, a)); }
        dust(x, y, n, spread, size) {
            n = this._n(n);
            for (let i = 0; i < n; i++) {
                const r = this.rng();
                this._push({ k: 'dust', layer: 0, x: x + (this.rng() - 0.5) * 4, y, vx: (this.rng() - 0.5) * spread * 40,
                    vy: -(8 + r * 22), life: 0, max: 0.35 + r * 0.3, size: size * (0.7 + this.rng() * 0.6), g: 0, drag: 2.2 });
            }
        }
        grass(x, y, n) {
            n = this._n(n);
            for (let i = 0; i < n; i++) {
                this._push({ k: 'grass', layer: 0, x, y, vx: (this.rng() - 0.5) * 70, vy: -(30 + this.rng() * 50),
                    life: 0, max: 0.45 + this.rng() * 0.25, size: 1.6, g: 260, drag: 0.5 });
            }
        }
        sweat(x, y) {
            if (this._n(1) < 1) return;
            this._push({ k: 'sweat', layer: 1, x, y, vx: (this.rng() - 0.5) * 24, vy: -18, life: 0, max: 0.55, size: 1.8, g: 150, drag: 0.3 });
        }
        star(x, y, vx, vy) {
            if (this._n(1) < 1) return;
            this._push({ k: 'star', layer: 1, x, y, vx: vx !== undefined ? vx : (this.rng() - 0.5) * 50,
                vy: vy !== undefined ? vy : -(30 + this.rng() * 30), life: 0, max: 0.8 + this.rng() * 0.4,
                size: 3 + this.rng() * 2.5, g: 80, drag: 0.6, rot: this.rng() * TAU, vr: (this.rng() - 0.5) * 6 });
        }
        confetti(x, y, n) {
            n = this._n(n);
            for (let i = 0; i < n; i++) {
                this._push({ k: 'confetti', layer: 1, x, y, vx: (this.rng() - 0.5) * 40, vy: 20 + this.rng() * 40,
                    life: 0, max: 1.6 + this.rng() * 0.8, size: 3, g: 55, drag: 0.4, rot: this.rng() * TAU,
                    vr: (this.rng() - 0.5) * 12, color: CONFETTI[Math.floor(this.rng() * CONFETTI.length)], ph: this.rng() * TAU });
            }
        }
        ring(x, y, maxR) {
            if (this.calma < 1) return;
            this._push({ k: 'ring', layer: 0, x, y, vx: 0, vy: 0, life: 0, max: 0.55, size: maxR, g: 0, drag: 0 });
        }
        sparks(x, y, n) {
            n = this._n(n);
            for (let i = 0; i < n; i++) {
                const a = this.rng() * TAU, s = 60 + this.rng() * 90;
                this._push({ k: 'spark', layer: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.18 + this.rng() * 0.12, size: 1, g: 0, drag: 3 });
            }
        }

        _updateParts(dt) {
            const out = [];
            for (const q of this.parts) {
                q.life += dt;
                if (q.life >= q.max) continue;
                q.vx *= Math.max(0, 1 - q.drag * dt);
                q.vy = q.vy * Math.max(0, 1 - q.drag * dt * (q.k === 'dust' ? 1 : 0.3)) + q.g * dt;
                if (q.k === 'confetti') q.vx += Math.sin(q.life * 7 + q.ph) * 40 * dt;
                q.x += q.vx * dt;
                q.y += q.vy * dt;
                if (q.rot !== undefined) q.rot += q.vr * dt;
                out.push(q);
            }
            this.parts = out;
        }

        // ---------- dibujo ----------
        drawUnder(ctx) { if (this.enabled) try { this._draw(ctx, 0); } catch (e) { this._fail(e); } }
        drawOver(ctx) { if (this.enabled) try { this._draw(ctx, 1); } catch (e) { this._fail(e); } }

        _draw(ctx, layer) {
            if (!this.parts.length) return;
            ctx.save();
            for (const q of this.parts) {
                if (q.layer !== layer) continue;
                const a = 1 - q.life / q.max;
                ctx.globalAlpha = clamp(a, 0, 1);
                switch (q.k) {
                    case 'dust':
                        ctx.fillStyle = 'rgb(222,214,190)';
                        ctx.globalAlpha = clamp(a * 0.4, 0, 1);
                        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.size * (1 + (1 - a) * 1.2)), 0, TAU); ctx.fill();
                        break;
                    case 'grass':
                        ctx.fillStyle = '#3f9a3a';
                        ctx.fillRect(q.x, q.y, q.size * 1.4, q.size);
                        break;
                    case 'sweat':
                        ctx.fillStyle = '#8fd3ff';
                        ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
                        break;
                    case 'star': this._drawStar(ctx, q); break;
                    case 'confetti':
                        ctx.save();
                        ctx.translate(q.x, q.y);
                        ctx.rotate(q.rot);
                        ctx.fillStyle = q.color;
                        ctx.fillRect(-1.5, -2.5, 3, 5 * Math.abs(Math.cos(q.life * 9 + q.ph)) + 1);
                        ctx.restore();
                        break;
                    case 'ring':
                        ctx.strokeStyle = '#fff2a8';
                        ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, q.size * (1 - a)), 0, TAU); ctx.stroke();
                        break;
                    case 'spark':
                        ctx.strokeStyle = '#ffe27a';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke();
                        break;
                }
            }
            ctx.restore();
        }

        _drawStar(ctx, q) {
            const r = q.size, r2 = r * 0.4;
            ctx.save();
            ctx.translate(q.x, q.y);
            ctx.rotate(q.rot);
            ctx.fillStyle = '#ffd83a';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const rad = i % 2 === 0 ? r : r2;
                const ang = i * Math.PI / 4;
                const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        drawBallTrail(ctx) {
            if (!this.enabled || !this.trail.length) return;
            try {
                const b = this.game.ball;
                const r = b ? b.radius : 9;
                ctx.save();
                for (const q of this.trail) {
                    ctx.globalAlpha = clamp(q.a * 0.28, 0, 1);
                    ctx.fillStyle = q.hot ? '#ffe9a0' : '#ffffff';
                    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, r * 0.75 * q.a), 0, TAU); ctx.fill();
                }
                ctx.restore();
            } catch (e) { this._fail(e); }
        }

        // Pelota rápida = se estira en el sentido del movimiento (solo dibujo)
        ballStretch() {
            if (!this.enabled) return null;
            const b = this.game.ball;
            if (!b || b.owner) return null;
            const sp = b.vel.length();
            if (sp < 8) return null;
            const k = Math.min(0.30, (sp - 8) * 0.03) * this.calma;
            return { angle: Math.atan2(b.vel.y, b.vel.x), sx: 1 + k, sy: 1 - k * 0.6 };
        }

        beginShake(ctx) {
            if (!this.enabled || this.shakeAmp < 0.08) return false;
            const a = this.shakeAmp * this.G.sacudida * this.calma;
            if (a < 0.05) return false;
            ctx.save();
            ctx.translate((this.rng() - 0.5) * 2 * a, (this.rng() - 0.5) * 2 * a);
            return true;
        }
        endShake(ctx) { ctx.restore(); }

        // ---------- consultas desde game.js ----------
        playerPose(p) {
            if (!this.enabled) return null;
            const st = this.states.get(p);
            return st ? st.pose : null;
        }
        indicatorBounce(p) {
            if (!this.enabled) return 0;
            const st = this.states.get(p);
            return st ? Math.sin(st.t * 6) * 1.2 * this.calma : 0;
        }
        drawIndicatorExtras(ctx, p) {
            if (!this.enabled) return;
            const st = this.states.get(p);
            if (!st || st.tm.pop <= 0) return;
            try {
                const k = 1 - st.tm.pop / st.du.pop;
                ctx.save();
                ctx.globalAlpha = clamp(0.85 * (1 - k), 0, 1);
                ctx.strokeStyle = '#ffe36b';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(p.pos.x, p.pos.y + 12, 10 + 26 * easeOut(k), 4 + 10 * easeOut(k), 0, 0, TAU);
                ctx.stroke();
                ctx.restore();
            } catch (e) { this._fail(e); }
        }
    }

    global.FX = { Mundo, EstadoJugador, sampleCurve, version: 1 };
})(typeof window !== 'undefined' ? window : globalThis);
