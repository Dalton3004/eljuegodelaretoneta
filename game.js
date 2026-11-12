/**
 * Liga Chaquito F8 - Etapa 3 (controles corregidos + menú final)
 * E = pase corto a compañero | R = centro / pase largo
 * Fin de partido → REVANCHA o MENÚ PRINCIPAL
 * HTML5 Canvas + JS puro
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================
const CONFIG = {
    WIDTH: 480,
    HEIGHT: 640,
    TARGET_FPS: 60,
    ASSETS_PATH: 'assets/',

    // Límites ajustados a las líneas blancas del sprite de cancha (480x640).
    // Los jugadores pueden entrar en la boca del arco para disputar pelotas
    // que quedan sobre la línea de fondo.
    FIELD: {
        LEFT: 78,
        RIGHT: 402,
        TOP: 99,
        BOTTOM: 572
    },

    // Boca real entre postes, línea de gol y fondo de red.
    GOAL_NORTH: { x: 188, y: 48, w: 104, h: 51, lineY: 99, backY: 48 },
    GOAL_SOUTH: { x: 188, y: 550, w: 104, h: 58, lineY: 572, backY: 608 },

    BALL_FRICTION: 0.975,
    BALL_BOUNCE: 0.82,
    BALL_RADIUS: 9,
    BALL_STOP_THRESHOLD: 0.12,

    PLAYER_SPEED: 2.4,
    PLAYER_SPRINT: 3.35,
    STAMINA_MAX: 100,
    STAMINA_SPRINT_DRAIN: 34,
    STAMINA_RUN_DRAIN: 11,
    STAMINA_RECOVERY: 9,
    AI_SPEED_MULTIPLIER: 1.12,
    AI_ACCELERATION: 0.18,
    AI_STEERING: 0.14,
    AI_TARGET_SMOOTHING: 0.1,
    ATTACK_ADVANCE: 76,
    DEFENSE_RETREAT: 48,
    TACTICAL_BURST_SECONDS: 1.45,
    TACTICAL_SPRINT_MULTIPLIER: 1.62,
    PLAYER_RADIUS: 13,
    POSSESSION_RANGE: 18,
    KICK_POWER: 11.5,
    PASS_POWER: 6.2,          // E - pase corto
    LONG_PASS_POWER: 11.5,    // R - centro / pase largo
    PASS_POWER_BOOST: 2.0,    // potencia de los pases: 1.0 = original, 2.0 = +100% (tools/configurar_pases.py)
    PASS_POWER_MAX: 22,       // tope de velocidad inicial de un pase (px por cuadro)
    // Barridas nerfeadas: menos alcance, menos tiempo y más enfriamiento
    SLIDE_SPEED: 3.6,
    SLIDE_DURATION: 0.26,
    SLIDE_COOLDOWN: 1.25,
    SLIDE_RECOVERY: 0.35,
    SLIDE_STEAL_RANGE: 16,
    SLIDE_STEAL_CHANCE: 0.42,

    // Colisiones entre jugadores
    COLLISION_PUSH: 2.4,
    // Parámetros de estabilidad: corrigen penetraciones sin convertir cada frame
    // de contacto en un nuevo "golpe". Se mantienen separados de la velocidad
    // de movimiento para no alterar la jugabilidad general.
    COLLISION_SLOP: 0.35,
    COLLISION_CORRECTION_PERCENT: 0.90,
    COLLISION_MAX_CORRECTION: 4.50,
    COLLISION_RESTITUTION: 0.22,
    COLLISION_MAX_IMPULSE: 0.85,
    COLLISION_MIN_APPROACH_SPEED: 0.06,
    COLLISION_SOLVER_ITERATIONS: 3,
    // Invulnerabilidad breve del receptor: evita encadenar impactos en frames consecutivos.
    // La separación física sigue funcionando durante este período, pero no se generan
    // nuevos impulsos/aturdimientos sobre la misma víctima.
    COLLISION_RECEIVER_COOLDOWN: 0.32,
    HIT_STUN: 0.38,
    HIT_SLOW: 0.55,

    // Animación de sprites
    SPRITE_SCALE: 1.12,
    KICK_ANIM_SEC: 0.18,

    MATCH_SECONDS: 180,
    GOAL_CELEBRATION_SEC: 2.8,
    PREMATCH_LOAD_SEC: 3.0,
    KICKOFF_COUNTDOWN_SEC: 3.0
};

// ============================================================
// DIFICULTADES (afectan al equipo RIVAL; el equipo del jugador no cambia)
//   walkStep / chaseStep / sprintStep: velocidad máxima (px por cuadro) al moverse, perseguir y esprintar.
//   carryFactor: cuánto se frena al llevar la pelota (el jugador humano se frena a 0.76).
//   staminaDrain / staminaRecover: gasto y recuperación de energía al esprintar; restBelow: energía a la que deja de esprintar.
//   react: cada cuántos segundos decide (más bajo = más reflejos). shootDist/shootProb/shotPower/aimErr: remate.
//   passProb/pressureDist: pase al compañero libre cuando lo presionan. predict: anticipa la trayectoria de la pelota.
//   doublePress: dos jugadores presionan al que tiene la pelota. tackleProb/tackleMin/tackleMax: barridas.
//   gk: arquero (eta/look: cuándo reacciona y cuánto anticipa; cooldown, speed, diveSpeed, diveResp, follow, readLead, reach).
//   Calibrado con tools/simulate.js (bot hábil): FÁCIL ~10-0 para el jugador, NORMAL parejo, DIFÍCIL ~1.5-6 en contra.
//   El arquero del jugador usa siempre el perfil de arquero NORMAL (ver Game._initMatch).
// ============================================================
const DIFICULTADES = {
    facil: {
        id: 'facil', nombre: 'FÁCIL', lema: 'Para entrar en calor',
        detalle: 'Rival lento, remata poco y su arquero tarda en reaccionar.',
        walkStep: 0.80, chaseStep: 1.40, sprintStep: 1.90, carryFactor: 0.76,
        staminaDrain: 1.0, staminaRecover: 1.0, restBelow: 50, sprintDist: 48,
        react: 0.40, shootDist: 150, shootProb: 0.30, shotPower: 0.90, aimErr: 0.25,
        passProb: 0.0, pressureDist: 0, predict: 0, doublePress: false,
        tackleProb: 0.22, tackleMin: 18, tackleMax: 42,
        gk: { eta: 1.5, look: 8, cap: 8, cooldown: 2.2, speed: 1.0, diveSpeed: 2.4, diveResp: 0.13, follow: 0.50, readLead: 0.12, reach: 0.9 }
    },
    normal: {
        id: 'normal', nombre: 'NORMAL', lema: 'Un partido parejo',
        detalle: 'Rival rápido que presiona, pasa y remata con puntería.',
        walkStep: 1.25, chaseStep: 2.00, sprintStep: 2.70, carryFactor: 0.85,
        staminaDrain: 0.7, staminaRecover: 1.3, restBelow: 40, sprintDist: 36,
        react: 0.18, shootDist: 175, shootProb: 0.50, shotPower: 1.06, aimErr: 0.12,
        passProb: 0.45, pressureDist: 34, predict: 0.6, doublePress: false,
        tackleProb: 0.45, tackleMin: 16, tackleMax: 48,
        gk: { eta: 5, look: 24, cap: 24, cooldown: 1.5, speed: 1.3, diveSpeed: 3.2, diveResp: 0.18, follow: 0.62, readLead: 0.30, reach: 1.1 }
    },
    dificil: {
        id: 'dificil', nombre: 'DIFÍCIL', lema: 'Equipo de élite: casi no perdona',
        detalle: 'Rival veloz e incansable: presión doble, anticipa tus pases, remata a las esquinas y tiene un arquero de primera.',
        walkStep: 1.50, chaseStep: 2.40, sprintStep: 3.00, carryFactor: 0.92,
        staminaDrain: 0.25, staminaRecover: 2.2, restBelow: 20, sprintDist: 22,
        react: 0.08, shootDist: 175, shootProb: 0.45, shotPower: 1.10, aimErr: 0.10,
        passProb: 0.7, pressureDist: 46, predict: 1.0, doublePress: true,
        tackleProb: 0.65, tackleMin: 14, tackleMax: 50,
        gk: { eta: 11, look: 32, cap: 32, cooldown: 1.1, speed: 1.7, diveSpeed: 4.0, diveResp: 0.28, follow: 0.80, readLead: 0.45, reach: 1.15 }
    }
};
const DIFICULTAD_ORDEN = ['facil', 'normal', 'dificil'];

const EstadoPartido = {
    PREPARANDO: 'PREPARANDO',       // pantalla de carga pre-partido (~5s)
    CUENTA_REGRESIVA: 'CUENTA_REGRESIVA', // 3..2..1
    EN_JUEGO: 'EN_JUEGO',
    CELEBRANDO_GOL: 'CELEBRANDO_GOL',
    FINALIZADO: 'FINALIZADO'
};

// ============================================================
// VECTOR 2D
// ============================================================
class Vector2D {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    set(x, y) { this.x = x; this.y = y; return this; }
    copy(v) { this.x = v.x; this.y = v.y; return this; }
    clone() { return new Vector2D(this.x, this.y); }
    add(v, mult = 1) { this.x += v.x * mult; this.y += v.y * mult; return this; }
    scale(s) { this.x *= s; this.y *= s; return this; }
    length() { return Math.hypot(this.x, this.y); }
    normalize() {
        const len = this.length();
        if (len > 0.0001) { this.x /= len; this.y /= len; }
        else { this.x = 0; this.y = 0; }
        return this;
    }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
    directionTo(v) {
        const dx = v.x - this.x, dy = v.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) return new Vector2D(0, 0);
        return new Vector2D(dx / len, dy / len);
    }
}

// ============================================================
// PELOTA
// ============================================================
class Pelota {
    constructor(x, y) {
        this.pos = new Vector2D(x, y);
        this.vel = new Vector2D(0, 0);
        this.radius = CONFIG.BALL_RADIUS;
        this.owner = null;
        this.kickCooldown = 0;
        this.passDrag = null;   // freno especial de un pase fuerte (null = fricción normal)
    }

    // Un pase sale más fuerte pero frena antes, de modo que alcanza 'range' px y se detiene
    // junto al compañero en vez de pasarse de largo. Con BOOST 1.0 equivale a la fricción original.
    setPassDrag(power, range) {
        this.passDrag = Math.max(0.80, Math.min(CONFIG.BALL_FRICTION, 1 - power / Math.max(1, range)));
    }

    update(dt) {
        if (this.kickCooldown > 0) this.kickCooldown--;

        if (this.owner) {
            this.passDrag = null;
            const offset = 18;
            let fx = this.owner.facing.x, fy = this.owner.facing.y;
            if (Math.abs(fx) + Math.abs(fy) < 0.1) {
                fx = 0;
                fy = this.owner.team === 'local' ? -1 : 1;
            }
            this.pos.x = this.owner.pos.x + fx * offset;
            this.pos.y = this.owner.pos.y + fy * offset;
            this.vel.set(0, 0);
            return;
        }

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        let friction = CONFIG.BALL_FRICTION;
        if (this.passDrag !== null) {
            if (this.vel.length() < 2.2) this.passDrag = null;   // ya casi llegó: vuelve la fricción normal
            else friction = this.passDrag;
        }
        this.vel.x *= friction;
        this.vel.y *= friction;
        if (Math.abs(this.vel.x) < CONFIG.BALL_STOP_THRESHOLD) this.vel.x = 0;
        if (Math.abs(this.vel.y) < CONFIG.BALL_STOP_THRESHOLD) this.vel.y = 0;
        this._bounceWalls();
    }

    _bounceWalls() {
        const f = CONFIG.FIELD;
        const r = this.radius;
        const gn = CONFIG.GOAL_NORTH;
        const gs = CONFIG.GOAL_SOUTH;
        // La pelota solo entra si pasa completamente entre los postes.
        const inNorthMouth = this.pos.x > gn.x + r * 0.85 && this.pos.x < gn.x + gn.w - r * 0.85;
        const inSouthMouth = this.pos.x > gs.x + r * 0.85 && this.pos.x < gs.x + gs.w - r * 0.85;

        if (this.pos.x - r < f.LEFT) {
            this.pos.x = f.LEFT + r;
            this.vel.x = -this.vel.x * CONFIG.BALL_BOUNCE;
        }
        if (this.pos.x + r > f.RIGHT) {
            this.pos.x = f.RIGHT - r;
            this.vel.x = -this.vel.x * CONFIG.BALL_BOUNCE;
        }

        // Línea de fondo norte: rebota fuera de los postes, entra al arco
        // dentro de la boca y se detiene/rebota suavemente contra la red.
        if (this.pos.y - r < f.TOP) {
            if (!inNorthMouth) {
                this.pos.y = f.TOP + r;
                this.vel.y = Math.abs(this.vel.y) * CONFIG.BALL_BOUNCE;
            } else if (this.pos.y - r < gn.backY) {
                this.pos.y = gn.backY + r;
                this.vel.y = Math.abs(this.vel.y) * 0.38;
            }
        }
        // Línea de fondo sur.
        if (this.pos.y + r > f.BOTTOM) {
            if (!inSouthMouth) {
                this.pos.y = f.BOTTOM - r;
                this.vel.y = -Math.abs(this.vel.y) * CONFIG.BALL_BOUNCE;
            } else if (this.pos.y + r > gs.backY) {
                this.pos.y = gs.backY - r;
                this.vel.y = -Math.abs(this.vel.y) * 0.38;
            }
        }
    }

    kick(direction, power) {
        this.owner = null;
        this.passDrag = null;
        this.kickCooldown = 18;
        const dir = direction.clone().normalize();
        if (dir.length() < 0.01) dir.set(0, -1);
        this.vel.x = dir.x * power;
        this.vel.y = dir.y * power;
    }

    reset(x, y) {
        this.pos.set(x, y);
        this.vel.set(0, 0);
        this.owner = null;
        this.passDrag = null;
    }
}

// ============================================================
// JUGADOR
// ============================================================
class Jugador {
    constructor(x, y, opts = {}) {
        this.pos = new Vector2D(x, y);
        this.homePos = new Vector2D(x, y);
        this.aiTarget = new Vector2D(x, y);
        this.tacticalState = 'balanced';
        this.tacticalBlend = 0;
        // Impulso táctico: sprint coordinado al cambiar entre ataque y defensa.
        this.tacticalBurstTimer = 0;
        this.tacticalBurstDuration = 1.45;
        this.vel = new Vector2D(0, 0);
        this.facing = new Vector2D(0, opts.team === 'rival' ? 1 : -1);
        this.radius = CONFIG.PLAYER_RADIUS;
        this.isHuman = !!opts.isHuman;
        this.team = opts.team || 'local'; // 'local' | 'rival'
        this.hasBall = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.hitStun = 0;       // no puede moverse
        this.hitSlow = 0;
        this.collisionCooldown = 0; // inmunidad breve tras recibir una colisión       // movimiento reducido
        this.hitFlash = 0;      // feedback visual del choque
        this.hitSquash = 0;     // animación de aplastamiento
        this.animFrame = 0;
        this.animTimer = 0;
        this.keys = { up: false, down: false, left: false, right: false, shift: false };
        this.frozen = false;
        this.tint = opts.tint || null;
        this.isGK = !!opts.isGK;
        // Estado propio del arquero: lectura del tiro, estirada y recuperación.
        this.gkAction = 'stand';
        this.gkActionTimer = 0;
        this.gkDiveCooldown = 0;
        this.gkDiveDir = 0;
        this.gkTargetX = x;
        this.gkReaction = 0.12 + ((this.aiSeed || 0) % 9) * 0.012;
        // Perfil individual ajustable desde tools/configurar_movilidad.py
        // Perfil de dificultad (solo el equipo rival lo recibe desde Game._initMatch).
        this.diff = null;
        this.aiActTimer = 0;
        this.aiTackleTimer = 0;
        this.mobilityId = opts.mobilityId || (this.isGK ? (this.team + '_gk') : this.team);
        const mobility = (typeof MOVILIDAD_JUGADORES !== 'undefined' && MOVILIDAD_JUGADORES[this.mobilityId]) || {};
        this.mobilityMultiplier = Number(mobility.velocidad) || (this.isGK ? 0.78 : (this.team === 'rival' ? 1.0 : 1.08));
        this.sprintMultiplier = Number(mobility.sprint) || 1.0;

        // Animación
        this.moving = false;
        this.sprinting = false;
        this.stamina = CONFIG.STAMINA_MAX;
        // IA: alterna sprint y recuperación con histéresis para evitar spam.
        this.aiSprintResting = false;
        this.animClock = Math.random() * 10;   // desfasa el "respirar" entre jugadores
        this.animDir = this.team === 'rival' ? 'down' : 'up';  // 'up' | 'down' | 'side'
        this.flipX = false;                    // mirar a la izquierda en vista lateral
        this.kickTimer = 0;
        // Carga del disparo: se acumula mientras se mantiene ESPACIO.
        this.shotCharging = false;
        this.shotCharge = 0;
        this.shotChargeMax = 1.25;

        // Ritmo, fase y deriva propios para evitar movimientos sincronizados.
        const seedText = String(this.mobilityId);
        let seed = 0;
        for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
        this.aiSeed = seed;
        this.aiPhase = (seed % 997) / 997 * Math.PI * 2;
        this.aiThinkTimer = (seed % 7) * 0.075;
        this.aiDriftX = Math.sin(this.aiPhase) * 5;
        this.aiDriftY = Math.cos(this.aiPhase * 1.37) * 4;
        this.aiSpeedFactor = 0.72 + ((seed >>> 4) % 29) / 100;
    }

    update(dt, ball, allPlayers) {
        if (this.frozen) { this.moving = false; this.sprinting = false; this.animFrame = 0; return; }

        if (this.slideCooldown > 0) this.slideCooldown -= dt;
        if (this.hitStun > 0) this.hitStun = Math.max(0, this.hitStun - dt);
        if (this.hitSlow > 0) this.hitSlow = Math.max(0, this.hitSlow - dt);
        if (this.collisionCooldown > 0) {
            this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
        }
        if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
        if (this.hitSquash > 0) this.hitSquash = Math.max(0, this.hitSquash - dt);
        if (this.shotCharging && this.hasBall) {
            this.shotCharge = Math.min(this.shotChargeMax, this.shotCharge + dt);
        } else if (this.shotCharging && !this.hasBall) {
            this.shotCharging = false;
            this.shotCharge = 0;
        }
        if (this.gkDiveCooldown > 0) this.gkDiveCooldown = Math.max(0, this.gkDiveCooldown - dt);
        if (this.gkActionTimer > 0) {
            this.gkActionTimer = Math.max(0, this.gkActionTimer - dt);
            if (this.gkActionTimer === 0 && this.isGK) this.gkAction = 'ready';
        }

        // Aturdido por choque o recuperación de barrida: no controla
        if (this.hitStun > 0) {
            this.vel.x *= 0.82;
            this.vel.y *= 0.82;
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
            this.moving = false;
            this.sprinting = false;
        } else if (this.isHuman) {
            if (this.isSliding) this._updateSlide(dt, ball);
            else this._updateMovement(dt);
        } else {
            if (this.isSliding) this._updateSlide(dt, ball);
            else this._updateSimpleAI(dt, ball, allPlayers);
        }

        this._updateStamina(dt);
        this._clampToField();

        this._updateAnimation(dt);

        this._handlePossession(ball);
    }

    // Decide qué animación mostrar: dirección visual (con histéresis para que no
    // parpadee en diagonales), si corre y a qué ritmo mueve las piernas.
    _updateAnimation(dt) {
        const speed = this.vel.length();
        // Histeresis para evitar que la animación de caminar entre/salga de
        // "moving" cuando la velocidad oscila alrededor del umbral (algo muy
        // frecuente al frenar, colisionar o quedar contra una pared).
        // Sin esto el frame se reinicia continuamente y visualmente parece
        // que el jugador vibra aunque su posición sea estable.
        const wasMoving = !!this.moving;
        const startMoveSpeed = 0.30;
        const keepMoveSpeed = 0.12;
        this.moving = !this.isSliding && (wasMoving ? speed > keepMoveSpeed : speed > startMoveSpeed);
        this.animClock += dt;
        if (this.kickTimer > 0) this.kickTimer = Math.max(0, this.kickTimer - dt);

        const ax = Math.abs(this.facing.x), ay = Math.abs(this.facing.y);
        if (this.animDir === 'side') {
            if (ay > ax * 1.35) this.animDir = this.facing.y < 0 ? 'up' : 'down';
        } else if (ax > ay * 1.35) {
            this.animDir = 'side';
        } else if (ay > 0.01) {
            this.animDir = this.facing.y < 0 ? 'up' : 'down';
        }
        if (this.animDir === 'side' && ax > 0.05) this.flipX = this.facing.x < 0;

        if (this.moving) {
            // más rápido el paso cuanto más rápido corre
            const period = 0.30 / Math.max(speed, 0.8);
            this.animTimer += dt;
            while (this.animTimer >= period) {
                this.animTimer -= period;
                this.animFrame = (this.animFrame + 1) % 4;
            }
        } else {
            this.animFrame = 0;
            this.animTimer = 0;
        }
    }

    _updateStamina(dt) {
        if (this.isGK) return; // el arquero no participa del sprint de campo
        if (this.sprinting) {
            this.stamina = Math.max(0, this.stamina - CONFIG.STAMINA_SPRINT_DRAIN * dt * (this.diff ? this.diff.staminaDrain : 1));
        } else if (!this.isHuman) {
            // Los compañeros de IA trotan sin gastar sprint y recuperan energía
            // hasta el 75%; el sprint vuelve a habilitarse recién allí.
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * dt * (this.diff ? this.diff.staminaRecover : 1));
            if (this.stamina >= (this.diff ? Math.min(75, this.diff.restBelow + 25) : 75)) this.aiSprintResting = false;
        } else if (!this.moving || this.vel.length() < CONFIG.PLAYER_SPEED * 0.8) {
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * dt);
        } else {
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * 0.12 * dt);
        }
    }

    _updateMovement(dt) {
        let dx = 0, dy = 0;
        if (this.keys.up)    dy -= 1;
        if (this.keys.down)  dy += 1;
        if (this.keys.left)  dx -= 1;
        if (this.keys.right) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;
            const canSprint = this.keys.shift && this.stamina > 1;
            const fatigue = 0.68 + 0.32 * (this.stamina / CONFIG.STAMINA_MAX);
            const possessionSlowdown = this.hasBall ? 0.76 : 1.0;
            const sprintScale = Math.min(1.0, this.sprintMultiplier) * 0.94;
            let speed = (canSprint ? CONFIG.PLAYER_SPRINT * sprintScale : CONFIG.PLAYER_SPEED) * this.mobilityMultiplier * fatigue * possessionSlowdown;
            if (this.hitSlow > 0) speed *= 0.45; // ralentizado tras choque
            this.sprinting = canSprint && this.hitSlow <= 0;
            // Aceleración/desaceleración gradual para quitar el movimiento rígido.
            const response = canSprint ? 0.22 : 0.19;
            this.vel.x += (dx * speed - this.vel.x) * response;
            this.vel.y += (dy * speed - this.vel.y) * response;
            this.facing.set(dx, dy);
        } else {
            this.vel.set(0, 0);
            this.sprinting = false;
        }
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
    }

    _updateSimpleAI(dt, ball, allPlayers) {
        const owner = ball ? ball.owner : null;
        const attackDir = this.team === 'local' ? -1 : 1;
        const goalY = this.team === 'local' ? CONFIG.FIELD.BOTTOM - 24 : CONFIG.FIELD.TOP + 24;

        if (this.isGK) {
            this._updateGoalkeeperAI(dt, ball, goalY, attackDir);
            return;
        }

        // Si el arquero controla la pelota, despeja automáticamente.
        if (this.isGK && owner === this) {
            const dir = new Vector2D(Math.sin(this.aiPhase) * 0.16, attackDir).normalize();
            this.facing.copy(dir);
            ball.kick(dir, CONFIG.LONG_PASS_POWER * 0.92);
            this.hasBall = false;
            this.kickTimer = CONFIG.KICK_ANIM_SEC;
            return;
        }

        let target = this.pos.clone();
        if (this.isGK) {
            const read = Math.max(-54, Math.min(54, (ball.pos.x - CONFIG.WIDTH / 2) * 0.34));
            target.set(CONFIG.WIDTH / 2 + read + this.aiDriftX, goalY + this.aiDriftY * 0.35);
        } else {
            const fieldPlayers = allPlayers.filter(p => p.team === this.team && !p.isGK);
            const nearest = fieldPlayers.reduce((best, p) =>
                !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
            if (!owner) {
                if (nearest === this) {
                    if (this.diff && this.diff.predict > 0) {
                        // Anticipa la trayectoria: va al punto donde la pelota va a estar, no a donde estaba.
                        const lead = Math.min(18, this.pos.distanceTo(ball.pos) / 3.0) * this.diff.predict;
                        target.set(ball.pos.x + ball.vel.x * lead, ball.pos.y + ball.vel.y * lead + attackDir * 6);
                    } else {
                        target.set(ball.pos.x + this.aiDriftX * 0.55, ball.pos.y + attackDir * 8 + this.aiDriftY * 0.45);
                    }
                } else {
                    target.set(this.homePos.x + this.aiDriftX + Math.sin(this.aiPhase + this.animClock * 0.55) * 2.5,
                               this.homePos.y + this.aiDriftY + Math.cos(this.aiPhase + this.animClock * 0.43) * 2);
                }
            } else if (owner.team === this.team) {
                if (owner === this) {
                    if (this.diff) {
                        const carry = this._aiCarry(dt, ball, allPlayers, attackDir);
                        if (carry === 'kicked') return;
                        target.copy(carry);
                    } else {
                        target.set(this.pos.x + this.aiDriftX * 0.18, this.pos.y + attackDir * 28);
                    }
                }
                else target.set(this.homePos.x + (owner.pos.x - this.homePos.x) * 0.12 + this.aiDriftX,
                                this.homePos.y + (owner.pos.y - this.homePos.y) * 0.10 + this.aiDriftY);
            } else if (this.diff && this.diff.doublePress && this._isSecondNearest(ball, allPlayers) &&
                       owner.pos.distanceTo(this.pos) < 150) {
                // Presión doble: el segundo defensor cierra por el costado del poseedor y le quita el pase.
                const side = owner.pos.x >= this.pos.x ? -1 : 1;
                target.set(owner.pos.x + side * 24, owner.pos.y - attackDir * 20);
            } else if (nearest === this) {
                // Solo el defensor más cercano presiona al poseedor. Se coloca
                // delante de su trayectoria para cerrar el avance, sin perseguirlo
                // hasta la boca del arco.
                target.set(owner.pos.x + this.aiDriftX * 0.18,
                           owner.pos.y - attackDir * 13 + this.aiDriftY * 0.12);
            } else {
                // Marcaje zonal: los otros defensores toman referencias sobre los
                // atacantes rivales cercanos a su carril y protegen el espacio
                // entre la pelota y el arco propio, en vez de amontonarse atrás.
                const opponents = allPlayers.filter(p => p.team !== this.team && !p.isGK);
                const marked = opponents.reduce((best, p) => {
                    const score = Math.abs(p.pos.x - this.homePos.x) + Math.abs(p.pos.y - owner.pos.y) * 0.22;
                    return !best || score < best.score ? { player: p, score } : best;
                }, null);
                const markX = marked ? marked.player.pos.x : owner.pos.x;
                const markY = marked ? marked.player.pos.y : owner.pos.y;
                target.set(this.homePos.x + (markX - this.homePos.x) * 0.38 + this.aiDriftX * 0.25,
                           markY - attackDir * 54 + this.aiDriftY * 0.2);
            }
        }

        // Estado táctico con histéresis: evita que el equipo cambie de plan
        // en cada frame cuando la pelota queda dividida cerca de mitad de cancha.
        const possessionState = owner && owner.team === this.team ? 'attack' :
            (owner && owner.team !== this.team ? 'defend' : null);
        const looseAttacking = !owner && (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir < -18;
        const looseDefending = !owner && (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir > 18;
        const desiredState = possessionState || (looseAttacking ? 'attack' : (looseDefending ? 'defend' : this.tacticalState));
        if (desiredState !== this.tacticalState) {
            const previousState = this.tacticalState;
            this.tacticalState = desiredState;
            this.tacticalBlend = 0;
            if (previousState !== 'balanced' && desiredState !== 'balanced') {
                this.tacticalBurstTimer = this.tacticalBurstDuration;
            } else if (desiredState === 'attack' || desiredState === 'defend') {
                this.tacticalBurstTimer = this.tacticalBurstDuration;
            }
        }
        this.tacticalBlend = Math.min(1, this.tacticalBlend + dt * 3.2);
        this.tacticalBurstTimer = Math.max(0, this.tacticalBurstTimer - dt);

        // Transiciones tácticas: bloque alto al atacar y repliegue compacto al
        // defender. Los objetivos se interpolan para que los desplazamientos
        // sean progresivos, sin teletransportes ni zigzags bruscos.
        if (!this.isGK) {
            const closestFieldPlayer = allPlayers.filter(p => p.team === this.team && !p.isGK)
                .reduce((best, p) => !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
            const chasing = (!owner && closestFieldPlayer === this) || (owner && owner.team !== this.team && closestFieldPlayer === this);
            const carrying = owner === this;
            if (!chasing && !carrying) {
                const teammates = allPlayers.filter(p => p.team === this.team && !p.isGK);
                const laneOrder = [...teammates].sort((a, b) => a.homePos.x - b.homePos.x);
                const lane = laneOrder.indexOf(this) - 1; // -1 izquierda, 0 centro, +1 derecha
                const hasPossession = !!owner && owner.team === this.team;
                const opponentPossession = !!owner && owner.team !== this.team;
                const ballInAttackingHalf = (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir < 0;
                const attacking = hasPossession || (!owner && ballInAttackingHalf);

                if (attacking) {
                    // Subida escalonada: los extremos abren la cancha y el
                    // compañero central ofrece una línea de pase por delante.
                    const advance = hasPossession ? CONFIG.ATTACK_ADVANCE * 1.72 : CONFIG.ATTACK_ADVANCE * 1.28;
                    const laneSpread = lane * 39;
                    target.x += laneSpread + (ball.pos.x - CONFIG.WIDTH / 2) * 0.06;
                    target.y += attackDir * advance;
                    if (hasPossession) target.y += attackDir * (lane === 0 ? 30 : 14);
                } else if (opponentPossession) {
                    // Repliegue: los no presionantes protegen el centro y
                    // retroceden hacia su propio arco sin amontonarse.
                    target.x += (ball.pos.x - this.homePos.x) * 0.16 + lane * 13;
                    target.y -= attackDir * 58;
                    // Los defensores de campo protegen el frente del área, no se
                    // meten dentro de la boca del arco ni se amontonan sobre el arquero.
                    const ownGoalLine = this.team === 'local' ? CONFIG.FIELD.BOTTOM - 72 : CONFIG.FIELD.TOP + 72;
                    target.y = this.team === 'local'
                        ? Math.min(target.y, ownGoalLine)
                        : Math.max(target.y, ownGoalLine);
                } else {
                    // Pelota dividida: el equipo acompaña la jugada con una
                    // línea compacta, lista para atacar o defender.
                    target.x += (ball.pos.x - this.homePos.x) * 0.08 + lane * 7;
                    target.y += attackDir * (ballInAttackingHalf ? 58 : -52);
                }
                target.x = Math.max(CONFIG.FIELD.LEFT + 20, Math.min(CONFIG.FIELD.RIGHT - 20, target.x));
                target.y = Math.max(CONFIG.FIELD.TOP + 12, Math.min(CONFIG.FIELD.BOTTOM - 12, target.y));
            }
        }

        // Barrida inteligente de recuperación: únicamente el perseguidor más
        // cercano intenta el quite, con la pelota delante y sin barrer a distancia
        // absurda. El resto mantiene el marcaje zonal para no abrir huecos.
        const tackleCandidates = allPlayers.filter(p => p.team === this.team && !p.isGK);
        const closestTackler = tackleCandidates.reduce((best, p) =>
            !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
        if (owner && owner.team !== this.team && closestTackler === this &&
            !this.hasBall && !this.isSliding && this.slideCooldown <= 0) {
            const tackleDistance = this.pos.distanceTo(owner.pos);
            const toOwner = this.pos.directionTo(owner.pos);
            const ballInFront = (toOwner.x * this.facing.x + toOwner.y * this.facing.y) > -0.15;
            const dTackle = this.diff;
            let tackleOk = true;
            if (dTackle) {
                this.aiTackleTimer -= dt;
                if (this.aiTackleTimer > 0) tackleOk = false;
                else { this.aiTackleTimer = 0.2; tackleOk = Math.random() < dTackle.tackleProb; }
            }
            const tMin = dTackle ? dTackle.tackleMin : 22, tMax = dTackle ? dTackle.tackleMax : 62;
            if (tackleOk && tackleDistance >= tMin && tackleDistance <= tMax && ballInFront) {
                this.facing.copy(this.pos.directionTo(owner.pos));
                this.barrida();
                return;
            }
        }

        // Suavizado exponencial de destino: reduce vibraciones de la IA y hace
        // que los cambios ataque/defensa se vean como una transición continua.
        const targetAlpha = 1 - Math.exp(-CONFIG.AI_TARGET_SMOOTHING * 60 * dt);
        this.aiTarget.x += (target.x - this.aiTarget.x) * targetAlpha;
        this.aiTarget.y += (target.y - this.aiTarget.y) * targetAlpha;
        target.copy(this.aiTarget);

        // Cada jugador decide en un intervalo distinto y tiene una velocidad propia.
        this.aiThinkTimer -= dt;
        if (this.aiThinkTimer <= 0) {
            this.aiThinkTimer = 0.12 + ((this.aiSeed >>> 7) % 11) * 0.025;
            this.aiPhase += 0.13 + ((this.aiSeed >>> 12) % 9) * 0.017;
        }
        const dir = this.pos.directionTo(target);
        const dist = this.pos.distanceTo(target);
        const fatigue = 0.58 + 0.42 * (this.stamina / CONFIG.STAMINA_MAX);
        const possessionSlowdown = this.hasBall ? 0.76 : 1.0;
        const fieldPlayers = allPlayers.filter(p => p.team === this.team && !p.isGK);
        const nearest = fieldPlayers.reduce((best, p) =>
            !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
        // Los tres jugadores salen en sprint coordinado al cambiar de fase.
        // El más cercano también puede gastar energía para presionar o atacar el balón.
        // Histeresis de resistencia para IA no controlada: sprint hasta 50%,
        // luego desplazamiento normal y recuperación hasta 75%.
        const dp = this.diff;
        const restBelow = dp ? dp.restBelow : 50;
        if (this.stamina <= restBelow) this.aiSprintResting = true;
        if (this.stamina >= (dp ? Math.min(75, restBelow + 25) : 75)) this.aiSprintResting = false;
        const sprintReady = !this.aiSprintResting && this.stamina > restBelow;
        const tacticalSprint = sprintReady && this.tacticalBurstTimer > 0 && dist > 12;
        const chaseSprint = sprintReady && nearest === this && dist > (dp ? dp.sprintDist : 48);
        const carrySprint = !!dp && sprintReady && owner === this && dist > 10;
        this.sprinting = !!(tacticalSprint || chaseSprint || carrySprint);
        const sprintBoost = this.sprinting ? 1.62 : 1.0;
        let speed = CONFIG.PLAYER_SPEED * 0.58 * this.mobilityMultiplier * (dp ? 1 : this.aiSpeedFactor) * fatigue * possessionSlowdown * sprintBoost;
        let maxStep = this.isGK ? 0.75 : (this.sprinting ? 1.32 : ((!owner && nearest === this && dist > 35) ? 0.92 : 0.52));
        if (dp && !this.isGK) {
            // Equipos con dificultad: velocidades propias del perfil (el humano corre a ~2.6, esprinta a ~3.4).
            const pursuing = nearest === this && (!owner || owner.team !== this.team) && dist > 30;
            let cap = this.sprinting ? dp.sprintStep : (pursuing ? dp.chaseStep : dp.walkStep);
            cap *= (0.9 + 0.1 * (this.stamina / CONFIG.STAMINA_MAX)) * (this.hasBall ? dp.carryFactor : 1);
            maxStep = cap;
            speed = cap * 1.2 * Math.min(1, dist / 18);   // frena al llegar para no vibrar alrededor del destino
        }
        if (dist > 2.5) {
            const factor = (!dp && this.aiThinkTimer < 0.08) ? 0.82 : 1;
            const steering = dp && dp.sprintStep > 2 ? (this.sprinting ? 0.34 : 0.24)
                           : (this.sprinting ? Math.min(0.30, CONFIG.AI_STEERING * 1.65) : CONFIG.AI_STEERING);
            this.vel.x += (dir.x * speed * factor - this.vel.x) * steering;
            this.vel.y += (dir.y * speed * factor - this.vel.y) * steering;
            const v = this.vel.length();
            if (v > maxStep) this.vel.scale(maxStep / v);
            if (this.vel.length() > 0.08) this.facing.copy(this.vel.clone().normalize());
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
            if (!this.isGK) {
                const ownGoalSafeY = this.team === 'local' ? CONFIG.FIELD.BOTTOM - 68 : CONFIG.FIELD.TOP + 68;
                this.pos.y = this.team === 'local'
                    ? Math.min(this.pos.y, ownGoalSafeY)
                    : Math.max(this.pos.y, ownGoalSafeY);
            }
        } else {
            this.vel.scale(0.55);
            if (this.vel.length() < 0.04) this.vel.set(0, 0);
        }
    }


    _isSecondNearest(ball, allPlayers) {
        const mates = allPlayers.filter(p => p.team === this.team && !p.isGK)
            .sort((a, b) => a.pos.distanceTo(ball.pos) - b.pos.distanceTo(ball.pos));
        return mates[1] === this;
    }

    // Jugador con la pelota (solo equipos con dificultad): decide entre rematar, pasar o seguir conduciendo.
    // Devuelve 'kicked' si pateó, o el punto hacia el que sigue conduciendo.
    _aiCarry(dt, ball, players, attackDir) {
        const d = this.diff;
        const goal = this.team === 'local' ? CONFIG.GOAL_NORTH : CONFIG.GOAL_SOUTH;
        const goalCx = goal.x + goal.w / 2;
        const lineY = goal.lineY;
        const enemies = players.filter(p => p.team !== this.team && !p.isGK);
        const enemyGK = players.find(p => p.team !== this.team && p.isGK);
        let nearOpp = null, nearOppDist = Infinity;
        for (const e of enemies) {
            const dd = e.pos.distanceTo(this.pos);
            if (dd < nearOppDist) { nearOppDist = dd; nearOpp = e; }
        }
        const dGoal = Math.hypot(goalCx - this.pos.x, lineY - this.pos.y);

        this.aiActTimer -= dt;
        if (this.aiActTimer <= 0) {
            this.aiActTimer = d.react * (0.8 + Math.random() * 0.4);
            const pressured = nearOpp && nearOppDist < d.pressureDist;

            // 1) REMATE: a la esquina contraria al arquero, con el error propio del nivel.
            const ahead = (lineY - this.pos.y) * attackDir > 0;
            if (ahead && dGoal < d.shootDist) {
                const forced = dGoal < 120 || (pressured && dGoal < d.shootDist * 0.8);
                if (forced || Math.random() < d.shootProb) {
                    const postL = goal.x + 17, postR = goal.x + goal.w - 17;
                    let aimX;
                    if (enemyGK) aimX = enemyGK.pos.x > goalCx ? postL : postR;
                    else aimX = Math.random() < 0.5 ? postL : postR;
                    if (Math.abs(this.pos.x - goalCx) > 75) aimX = this.pos.x < goalCx ? postR : postL; // desde el costado, al palo lejano
                    const aim = new Vector2D(aimX, lineY + attackDir * 18);
                    const dir = this.pos.directionTo(aim).normalize();
                    const ang = (Math.random() - 0.5) * 2 * d.aimErr;
                    const c = Math.cos(ang), s = Math.sin(ang);
                    const shot = new Vector2D(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
                    this._aiKick(ball, shot, CONFIG.KICK_POWER * d.shotPower * (0.92 + Math.random() * 0.16));
                    return 'kicked';
                }
            }

            // 2) PASE: si lo presionan y hay un compañero libre y mejor ubicado.
            if (pressured && Math.random() < d.passProb) {
                let best = null, bestScore = -Infinity;
                for (const m of players) {
                    if (m === this || m.isGK || m.team !== this.team) continue;
                    let free = Infinity;
                    for (const e of enemies) free = Math.min(free, e.pos.distanceTo(m.pos));
                    const progress = (m.pos.y - this.pos.y) * attackDir;
                    const dist = m.pos.distanceTo(this.pos);
                    if (free < 42 || dist < 40 || dist > 260) continue;
                    const score = progress * 0.9 + free * 0.6 - dist * 0.15;
                    if (score > bestScore) { bestScore = score; best = m; }
                }
                if (best && bestScore > -30) {
                    const predicted = best.pos.clone().add(best.vel || new Vector2D(0, 0), 4);
                    const dir = ball.pos.directionTo(predicted).normalize();
                    const distance = ball.pos.distanceTo(predicted);
                    const needed = Math.max(1.8, Math.min(10.0, distance * (1 - CONFIG.BALL_FRICTION) * 1.12));
                    const power = Math.min(CONFIG.PASS_POWER_MAX, needed * CONFIG.PASS_POWER_BOOST);
                    this._aiKick(ball, dir, power);
                    ball.setPassDrag(power, distance * 1.12);
                    return 'kicked';
                }
            }
        }

        // 3) CONDUCCIÓN: hacia el arco, esquivando al defensor que tiene delante.
        let tx = this.pos.x + (goalCx - this.pos.x) * (dGoal < d.shootDist ? 0.35 : 0.06);
        let ty = this.pos.y + attackDir * 60;
        if (nearOpp && nearOppDist < 90 && (nearOpp.pos.y - this.pos.y) * attackDir > -14) {
            const side = this.pos.x >= nearOpp.pos.x ? 1 : -1;
            tx += side * (d.react < 0.12 ? 62 : 44);
        }
        tx = Math.max(CONFIG.FIELD.LEFT + 24, Math.min(CONFIG.FIELD.RIGHT - 24, tx));
        ty = Math.max(CONFIG.FIELD.TOP + 12, Math.min(CONFIG.FIELD.BOTTOM - 14, ty));
        return new Vector2D(tx, ty);
    }

    _aiKick(ball, dir, power) {
        this.facing.copy(dir);
        ball.kick(dir, power);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
    }

    _updateGoalkeeperAI(dt, ball, goalY, attackDir) {
        if (!ball) return;
        if (ball.owner === this) {
            this.hasBall = true;
            if (this.gkActionTimer <= 0) {
                const clearance = new Vector2D(
                    Math.max(-0.32, Math.min(0.32, (CONFIG.WIDTH / 2 - this.pos.x) / 150)),
                    this.team === 'local' ? -1 : 1
                ).normalize();
                ball.kick(clearance, CONFIG.LONG_PASS_POWER * 0.88);
                this.hasBall = false;
                this.gkAction = 'ready';
                this.gkDiveCooldown = 0.55;
            }
            return;
        }
        const goal = this.team === 'local' ? CONFIG.GOAL_SOUTH : CONFIG.GOAL_NORTH;
        const goalCenter = goal.x + goal.w / 2;
        const ownGoalDir = this.team === 'local' ? 1 : -1;
        const incoming = ball.vel.y * ownGoalDir > 0.65;
        const towardGoal = (ball.pos.y - goalY) * ownGoalDir < 0;
        let predictedX = ball.pos.x;
        let eta = 99;
        if (incoming) {
            eta = (goalY - ball.pos.y) / (ball.vel.y || 0.001);
            const gk = this.diff ? this.diff.gk : null;
            if (eta >= 0 && eta < (gk ? gk.look : 1.15)) predictedX = ball.pos.x + ball.vel.x * Math.min(eta, gk ? gk.cap : 0.85);
        }
        const gkp = this.diff ? this.diff.gk : null;

        const insideGoalMouth = predictedX > goal.x + 5 && predictedX < goal.x + goal.w - 5;
        const danger = incoming && towardGoal && eta >= 0 && eta < (gkp ? gkp.eta : 0.30) && insideGoalMouth;
        const lateral = predictedX - this.pos.x;
        const diveThreshold = 23; // reservado para ajustes de dificultad

        // Anticipa el disparo y se arroja en dirección al punto de cruce.
        if (danger && this.gkDiveCooldown <= 0 && this.gkAction !== 'dive' && this.gkAction !== 'catch') {
            this.gkDiveDir = Math.abs(lateral) > 7 ? Math.sign(lateral) : (ball.vel.x >= 0 ? 1 : -1);
            const height = Math.abs(ball.pos.y - goalY);
            this.gkAction = height < 30 ? 'dive_low' : (height < 68 ? 'dive_mid' : 'dive_up');
            this.gkActionTimer = 0.30;
            this.gkDiveCooldown = gkp ? gkp.cooldown : 2.05;
            this.gkTargetX = Math.max(goal.x - 5, Math.min(goal.x + goal.w + 5, predictedX));
        }

        // El arquero acompaña horizontalmente la pelota, sin abandonar el área.
        const readX = ball.pos.x + (incoming ? ball.vel.x * (gkp ? gkp.readLead : 0.18) : 0);
        const homeX = goalCenter + Math.max(-48, Math.min(48, (readX - goalCenter) * (gkp ? gkp.follow : 0.58)));
        let targetX = homeX;
        if (this.gkAction.startsWith('dive')) targetX = this.gkTargetX;
        const maxX = goalCenter + goal.w * 0.5 + 12;
        targetX = Math.max(goalCenter - goal.w * 0.5 - 12, Math.min(maxX, targetX));
        const diving = this.gkAction.startsWith('dive');
        const maxSpeed = diving ? (gkp ? gkp.diveSpeed : 1.85) : (gkp ? gkp.speed : 0.92);
        const dx = targetX - this.pos.x;
        this.vel.x = Math.max(-maxSpeed, Math.min(maxSpeed, dx * (diving ? (gkp ? gkp.diveResp : 0.13) : (gkp ? 0.060 * gkp.speed / 0.92 : 0.060))));
        const targetY = goalY + (this.gkAction.startsWith('dive') ? -ownGoalDir * 4 : 0);
        this.vel.y = Math.max(-0.9, Math.min(0.9, (targetY - this.pos.y) * 0.08));
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        if (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 0.08) this.facing.set(Math.sign(this.vel.x) || 0, -ownGoalDir * 0.12);
        else this.facing.set((ball.pos.x >= this.pos.x ? 1 : -1) * 0.15, -ownGoalDir);

        if (this.gkActionTimer <= 0 && !danger) this.gkAction = 'ready';
    }

    _updateSlide(dt, ball) {
        this.slideTimer -= dt;
        this.pos.x += this.facing.x * CONFIG.SLIDE_SPEED;
        this.pos.y += this.facing.y * CONFIG.SLIDE_SPEED;
        // Intento de robo solo al final de la barrida y cerca de la pelota
        if (this.slideTimer <= 0) {
            this.isSliding = false;
            this.slideCooldown = CONFIG.SLIDE_COOLDOWN;
            this.vel.set(0, 0);
            this.hitStun = Math.max(this.hitStun, CONFIG.SLIDE_RECOVERY);
            if (ball && !this.hasBall) {
                const dist = this.pos.distanceTo(ball.pos);
                if (dist <= CONFIG.SLIDE_STEAL_RANGE && Math.random() < CONFIG.SLIDE_STEAL_CHANCE) {
                    if (ball.owner && ball.owner !== this) {
                        ball.owner.hasBall = false;
                        // El dueño anterior recibe un pequeño empujón
                        const away = ball.owner.pos.directionTo(this.pos).normalize();
                        ball.owner.vel.x -= away.x * 1.8;
                        ball.owner.vel.y -= away.y * 1.8;
                        ball.owner.hitSlow = Math.max(ball.owner.hitSlow, 0.28);
                    }
                    if (ball.kickCooldown <= 0) {
                        ball.owner = this;
                        this.hasBall = true;
                        ball.vel.set(0, 0);
                    }
                }
            }
        }
    }

    _clampToField() {
        const f = CONFIG.FIELD;
        const r = this.radius;
        // Laterales dentro de la cancha; longitudinalmente se permite entrar
        // hasta el fondo de cada red para alcanzar la pelota detrás de la línea.
        // Permitir que todos los jugadores entren hasta el fondo de la red: así
        // pueden recuperar la pelota incluso si queda detrás de la línea de gol.
        const northLimit = CONFIG.GOAL_NORTH.backY - r + 2;
        const southLimit = CONFIG.GOAL_SOUTH.backY + r - 2;
        this.pos.x = Math.max(f.LEFT + r, Math.min(f.RIGHT - r, this.pos.x));
        this.pos.y = Math.max(northLimit, Math.min(southLimit, this.pos.y));
        // La IA de campo nunca invade su propia red, tampoco durante una barrida.
        if (!this.isHuman && !this.isGK) {
            const safeY = this.team === 'local' ? f.BOTTOM - 68 : f.TOP + 68;
            this.pos.y = this.team === 'local' ? Math.min(this.pos.y, safeY) : Math.max(this.pos.y, safeY);
        }
    }

    _handlePossession(ball) {
        if (ball.owner === this) {
            this.hasBall = true;
            return;
        }
        this.hasBall = false;

        // El área de contacto del arquero cubre el cuerpo completo del sprite,
        // también durante las estiradas. Los tiros rápidos se desvían o se atrapan.
        if (this.isGK) {
            const diving = this.gkAction.startsWith('dive');
            const reach = this.diff ? this.diff.gk.reach : 1;
            const rx = (diving ? 21 : 16) * reach;
            const ry = (diving ? 16 : 13) * reach;
            // El centro de contacto se alinea con el torso del sprite (anclado en los pies).
            const nx = (ball.pos.x - this.pos.x) / rx;
            const ny = (ball.pos.y - (this.pos.y - 27)) / ry;
            if (nx * nx + ny * ny <= 1.0) {
                const speed = ball.vel.length();
                if (speed > 0.8) {
                    const toward = this.team === 'local' ? ball.vel.y > 0 : ball.vel.y < 0;
                    if (toward || diving) {
                        const saveDir = new Vector2D(
                            Math.sign(ball.pos.x - this.pos.x) * 0.34 + (this.gkDiveDir || 0) * 0.22,
                            this.team === 'local' ? -1 : 1
                        ).normalize();
                        ball.owner = null;
                        ball.vel.set(saveDir.x * Math.max(3.2, speed * 0.48), saveDir.y * Math.max(3.2, speed * 0.48));
                        ball.kickCooldown = 10;
                        this.gkAction = 'catch';
                        this.gkActionTimer = 0.34;
                        this.gkDiveCooldown = Math.max(this.gkDiveCooldown, 0.38);
                        return;
                    }
                }
                if (ball.kickCooldown <= 0 && ball.vel.length() < 2.8) {
                    ball.owner = this;
                    this.hasBall = true;
                    this.gkAction = 'catch';
                    this.gkActionTimer = 0.34;
                    return;
                }
            }
        }

        if (ball.kickCooldown > 0) return;
        if (this.isSliding) return;

        const dist = this.pos.distanceTo(ball.pos);
        const ballSpeed = ball.vel.length();
        if (dist < CONFIG.POSSESSION_RANGE && ballSpeed < 4.0) {
            if (ball.owner) {
                const ownerDist = ball.owner.pos.distanceTo(ball.pos);
                if (dist >= ownerDist - 2) return;
                ball.owner.hasBall = false;
            }
            ball.owner = this;
            this.hasBall = true;
        }
    }

    // ESPACIO: mantener para cargar el tiro; sin pelota, barrer.
    actionSpace(ball) {
        if (this.frozen || !this.isHuman) return;
        if (this.hasBall && ball.owner === this) {
            if (!this.shotCharging) { this.shotCharging = true; this.shotCharge = 0; }
        } else if (!this.hasBall && !this.isSliding && this.slideCooldown <= 0) {
            this.barrida();
        }
    }

    releaseShotCharge(ball) {
        if (!this.shotCharging) return;
        const charge = Math.max(0, Math.min(1, this.shotCharge / this.shotChargeMax));
        this.shotCharging = false;
        this.shotCharge = 0;
        if (!this.frozen && this.hasBall && ball.owner === this) {
            // Un toque rápido da un tiro controlado; mantener hasta el máximo
            // aumenta progresivamente la potencia hasta un 35%.
            this.patear(ball, 0.65 + charge * 0.70);
        }
    }

    // E: pase automático al compañero más cercano, sin filtros de distancia
    // ni de orientación. La dirección apunta directamente a su posición actual.
    actionPass(ball, teammates) {
        if (this.frozen || !this.isHuman) return;
        if (!this.hasBall || ball.owner !== this) return;

        const target = this._findNearestPassTarget(teammates);
        if (!target) return;

        // Apuntar desde la posición real de la pelota (no desde el centro del jugador)
        // y anticipar ligeramente el movimiento del receptor.
        const predictedTarget = target.pos.clone().add(target.vel || new Vector2D(0, 0), 4);
        const dir = ball.pos.directionTo(predictedTarget).normalize();
        const distance = ball.pos.distanceTo(predictedTarget);
        // La fricción se aplica por frame: esta potencia aproxima el alcance
        // necesario para que el pase llegue al compañero sin salir disparado.
        const needed = Math.max(1.8, Math.min(10.0, distance * (1 - CONFIG.BALL_FRICTION) * 1.12));
        // Pase más fuerte (PASS_POWER_BOOST): sale más rápido y frena para llegar justo al compañero.
        const power = Math.min(CONFIG.PASS_POWER_MAX, needed * CONFIG.PASS_POWER_BOOST);
        ball.kick(dir, power);
        ball.setPassDrag(power, distance * 1.12);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
        this.facing.copy(dir);
        console.log(`[Pase] Dirigido a compañero de campo (${Math.round(distance)} px)`);
    }

    // R: centro / pase largo
    actionLongPass(ball) {
        if (this.frozen || !this.isHuman) return;
        if (!this.hasBall || ball.owner !== this) return;

        const dir = this.facing.clone();
        if (dir.length() < 0.1) dir.set(0, -1);
        // Ligeramente más "elevado" en sensación: más potencia
        const power = Math.min(CONFIG.PASS_POWER_MAX, CONFIG.LONG_PASS_POWER * CONFIG.PASS_POWER_BOOST);
        ball.kick(dir, power);
        // Mismo alcance que antes (~500 px), recorrido mucho más rápido.
        ball.setPassDrag(power, CONFIG.LONG_PASS_POWER / (1 - CONFIG.BALL_FRICTION) * 1.1);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
        console.log('[Pase] Centro / largo');
    }

    _findNearestPassTarget(teammates) {
        if (!teammates || teammates.length === 0) return null;
        let nearest = null;
        let nearestDistance = Infinity;
        for (const teammate of teammates) {
            // Nunca dirigir el pase al arquero: E busca solo a los compañeros de campo.
            if (!teammate || teammate === this || teammate.isGK || teammate.team !== this.team) continue;
            const distance = this.pos.distanceTo(teammate.pos);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = teammate;
            }
        }
        return nearest;
    }

    patear(ball, powerMultiplier = 1) {
        if (!this.hasBall || ball.owner !== this) return;
        // Asistencia suave de puntería: corrige tiros muy desviados hacia el arco rival
        // sin quitarle al jugador el control de la dirección elegida.
        const goal = new Vector2D(CONFIG.WIDTH / 2,
            this.team === 'local' ? CONFIG.GOAL_NORTH.y + CONFIG.GOAL_NORTH.h / 2
                                  : CONFIG.GOAL_SOUTH.y + CONFIG.GOAL_SOUTH.h / 2);
        const goalDir = this.pos.directionTo(goal).normalize();
        const aimDir = this.facing.clone();
        if (aimDir.length() < 0.1) aimDir.copy(goalDir);
        aimDir.normalize();
        const assistedDir = aimDir.scale(0.32).add(goalDir, 0.68).normalize();
        ball.kick(assistedDir, CONFIG.KICK_POWER * powerMultiplier);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
    }

    barrida() {
        if (this.hasBall || this.isSliding || this.slideCooldown > 0) return;
        this.isSliding = true;
        this.slideTimer = CONFIG.SLIDE_DURATION;
        this.vel.set(0, 0);
    }

    resetToHome() {
        this.pos.copy(this.homePos);
        this.vel.set(0, 0);
        this.hasBall = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.gkAction = 'stand';
        this.gkActionTimer = 0;
        this.gkDiveCooldown = 0;
        this.gkDiveDir = 0;
        this.gkTargetX = this.homePos.x;
        this.facing.set(0, this.team === 'rival' ? 1 : -1);
        this.animDir = this.team === 'rival' ? 'down' : 'up';
        this.kickTimer = 0;
        this.moving = false;
    }
}

// ============================================================
// GESTOR DE PARTIDO
// ============================================================
class GestorPartido {
    constructor(ball, players) {
        this.ball = ball;
        this.players = players;

        this.estado = EstadoPartido.PREPARANDO;
        this.pausado = false;
        this.pauseMenuSelection = 0; // 0 = CONTINUAR, 1 = REINICIAR, 2 = SALIR
        this.framesRestantes = CONFIG.MATCH_SECONDS * CONFIG.TARGET_FPS;
        this.timerFestejo = 0;
        this.prematchTimer = CONFIG.PREMATCH_LOAD_SEC;
        this.countdownTimer = CONFIG.KICKOFF_COUNTDOWN_SEC;
        this.countdownNumber = 3;

        this.golesLocal = 0;
        this.golesRival = 0;

        this.cartel = null;
        this.cartelAlpha = 0;
        this.cartelScale = 1;
        this.goalScoredThisFrame = false;

        // Menú de fin de partido
        this.endMenuSelection = 0; // 0 = REVANCHA, 1 = MENÚ PRINCIPAL

        // Congelar jugadores durante la preparación
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
    }

    update(dt) {
        if (this.pausado) return;
        switch (this.estado) {
            case EstadoPartido.PREPARANDO:
                this._updatePrematch(dt);
                break;
            case EstadoPartido.CUENTA_REGRESIVA:
                this._updateCountdown(dt);
                break;
            case EstadoPartido.EN_JUEGO:
                this._updatePlaying(dt);
                break;
            case EstadoPartido.CELEBRANDO_GOL:
                this._updateCelebration(dt);
                break;
            case EstadoPartido.FINALIZADO:
                // animación suave del cartel
                if (this.cartelAlpha < 1) this.cartelAlpha = Math.min(1, this.cartelAlpha + dt * 1.8);
                if (this.cartelScale < 1.05) this.cartelScale = Math.min(1.05, this.cartelScale + dt * 1.2);
                break;
        }
    }

    _updatePrematch(dt) {
        this.prematchTimer -= dt;
        // Jugadores quietos en sus posiciones
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
        if (this.ball) this.ball.vel.set(0, 0);
        if (this.prematchTimer <= 0) {
            this.estado = EstadoPartido.CUENTA_REGRESIVA;
            this.countdownTimer = CONFIG.KICKOFF_COUNTDOWN_SEC;
            this.countdownNumber = 3;
        }
    }

    _updateCountdown(dt) {
        this.countdownTimer -= dt;
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
        if (this.ball) this.ball.vel.set(0, 0);
        // Número visible: 3, 2, 1
        const left = Math.max(0, this.countdownTimer);
        this.countdownNumber = left > 2 ? 3 : (left > 1 ? 2 : (left > 0 ? 1 : 0));
        if (this.countdownTimer <= 0) {
            this.estado = EstadoPartido.EN_JUEGO;
            for (const p of this.players) p.frozen = false;
        }
    }

    _updatePlaying(dt) {
        this.framesRestantes--;
        if (this.framesRestantes <= 0) {
            this.framesRestantes = 0;
            this._finalizarPartido();
            return;
        }

        for (const p of this.players) p.update(dt, this.ball, this.players);
        this._resolvePlayerCollisions();
        this.ball.update(dt);
        this._verificarGoles();
    }

    _resolvePlayerCollisions() {
        const list = this.players;
        const n = list.length;
        const iterations = CONFIG.COLLISION_SOLVER_ITERATIONS;

        // Resolver varias veces una penetración pequeña es más estable que
        // aplicar un empujón grande y dejar que el siguiente frame lo revierta.
        for (let iteration = 0; iteration < iterations; iteration++) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const a = list[i], b = list[j];

                    // Solo colisionan rivales; compañeros del mismo equipo se atraviesan.
                    if (a.team === b.team) continue;
                    if (a.isSliding && b.isSliding) continue;

                    const dx = b.pos.x - a.pos.x;
                    const dy = b.pos.y - a.pos.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = a.radius + b.radius;

                    // Tolerancia: evita que una diferencia microscópica de posición
                    // active el solver continuamente.
                    if (distSq >= (minDist - CONFIG.COLLISION_SLOP) ** 2) continue;

                    let dist = Math.sqrt(distSq);
                    let nx, ny;

                    if (dist > 0.0001) {
                        nx = dx / dist;
                        ny = dy / dist;
                    } else {
                        // Posiciones idénticas: dirección determinista, sin dividir
                        // por cero ni introducir ruido aleatorio.
                        const parity = (i + j) & 1;
                        nx = parity ? 1 : 0;
                        ny = parity ? 0 : 1;
                        dist = 0;
                    }

                    const overlap = minDist - dist;
                    if (overlap <= CONFIG.COLLISION_SLOP) continue;

                    // Corrección proporcional y limitada. El reparto 50/50 evita que
                    // un jugador quede "pegado" mientras el otro recibe todo el ajuste.
                    const correction = Math.min(
                        CONFIG.COLLISION_MAX_CORRECTION,
                        overlap * CONFIG.COLLISION_CORRECTION_PERCENT
                    );
                    const halfCorrection = correction * 0.5;

                    a.pos.x -= nx * halfCorrection;
                    a.pos.y -= ny * halfCorrection;
                    b.pos.x += nx * halfCorrection;
                    b.pos.y += ny * halfCorrection;

                    // No aplicar un knockback constante: era la principal fuente de
                    // oscilación cuando dos jugadores volvían a entrar en contacto.
                    // Solo modificamos la componente normal si realmente se acercan.
                    const relativeNormalSpeed =
                        (b.vel.x - a.vel.x) * nx +
                        (b.vel.y - a.vel.y) * ny;

                    if (relativeNormalSpeed < -CONFIG.COLLISION_MIN_APPROACH_SPEED) {
                        // Determinamos primero quién recibe el impacto. Esto permite
                        // aplicar un cooldown SOLO al receptor, en lugar de bloquear
                        // a ambos jugadores.
                        const av = Math.hypot(a.vel.x, a.vel.y);
                        const bv = Math.hypot(b.vel.x, b.vel.y);
                        const victim = av < bv ? a : b;
                        const hitter = av < bv ? b : a;

                        // Si la víctima acaba de recibir un impacto, NO se vuelve a
                        // impulsar ni a aturdir durante este pequeño período. La
                        // separación de posiciones de arriba sí continúa, evitando
                        // que quede atrapada contra una pared u otro jugador.
                        if (victim.collisionCooldown > 0) continue;

                        const impulse = Math.min(
                            CONFIG.COLLISION_MAX_IMPULSE,
                            -relativeNormalSpeed * (1 + CONFIG.COLLISION_RESTITUTION) * 0.5
                        );

                        a.vel.x -= nx * impulse;
                        a.vel.y -= ny * impulse;
                        b.vel.x += nx * impulse;
                        b.vel.y += ny * impulse;

                        // El feedback de choque solo se dispara ante un impacto real,
                        // no mientras permanecen en contacto.
                        const impact = Math.min(
                            1.2,
                            (av + bv) * 0.22 + overlap * 0.08
                        );

                        if (impact >= 0.12) {
                            // Bloqueamos nuevas colisiones sobre ESTA víctima hasta
                            // que expire el cooldown. Esto corta el spam de impactos
                            // que hacía vibrar a los jugadores en esquinas.
                            victim.collisionCooldown = Math.max(
                                victim.collisionCooldown,
                                CONFIG.COLLISION_RECEIVER_COOLDOWN
                            );

                            if (!victim.isSliding) {
                                victim.hitStun = Math.max(
                                    victim.hitStun,
                                    CONFIG.HIT_STUN * (0.55 + impact * 0.5)
                                );
                                victim.hitSlow = Math.max(
                                    victim.hitSlow,
                                    CONFIG.HIT_SLOW * (0.7 + impact * 0.4)
                                );
                                victim.hitFlash = Math.max(victim.hitFlash, 0.10);
                                victim.hitSquash = Math.max(victim.hitSquash, 0.14);
                            }

                            if (!hitter.isSliding) {
                                hitter.hitSlow = Math.max(
                                    hitter.hitSlow,
                                    CONFIG.HIT_SLOW * 0.35
                                );
                                hitter.hitFlash = Math.max(hitter.hitFlash, 0.05);
                            }

                            // Si la víctima tenía la pelota y el impacto fue fuerte,
                            // conserva la lógica original de pérdida de posesión.
                            if (
                                victim.hasBall &&
                                this.ball &&
                                this.ball.owner === victim &&
                                impact > 0.55
                            ) {
                                victim.hasBall = false;
                                this.ball.owner = null;
                                const direction = victim === a ? -1 : 1;
                                this.ball.vel.x += nx * direction * 2.2;
                                this.ball.vel.y += ny * direction * 2.2;
                            }
                        }
                    }
                }
            }
        }
    }

    _verificarGoles() {
        if (this.goalScoredThisFrame) return;
        const b = this.ball;
        const gn = CONFIG.GOAL_NORTH;
        const gs = CONFIG.GOAL_SOUTH;

        if (b.pos.y < gn.lineY &&
            b.pos.x > gn.x + b.radius * 0.85 && b.pos.x < gn.x + gn.w - b.radius * 0.85 &&
            b.pos.y > gn.backY - b.radius) {
            this.golesLocal++;
            this._registrarGol();
            return;
        }

        if (b.pos.y > gs.lineY &&
            b.pos.x > gs.x + b.radius * 0.85 && b.pos.x < gs.x + gs.w - b.radius * 0.85 &&
            b.pos.y < gs.backY + b.radius) {
            this.golesRival++;
            this._registrarGol();
        }
    }

    _registrarGol() {
        this.goalScoredThisFrame = true;
        this.estado = EstadoPartido.CELEBRANDO_GOL;
        this.cartel = 'GOL';
        this.cartelAlpha = 0;
        this.cartelScale = 0.4;
        this.timerFestejo = CONFIG.GOAL_CELEBRATION_SEC;

        this.ball.owner = null;
        for (const p of this.players) {
            p.frozen = true;
            p.hasBall = false;
            p.isSliding = false;
            p.vel.set(0, 0);
        }
    }

    _updateCelebration(dt) {
        this.timerFestejo -= dt;
        if (this.cartelAlpha < 1) this.cartelAlpha = Math.min(1, this.cartelAlpha + dt * 3);
        if (this.cartelScale < 1) this.cartelScale = Math.min(1, this.cartelScale + dt * 2.2);

        if (this.timerFestejo <= 0) {
            this._resetearCancha();
            this.cartel = null;
            this.estado = EstadoPartido.EN_JUEGO;
            this.goalScoredThisFrame = false;
            for (const p of this.players) p.frozen = false;
        }
    }

    _resetearCancha() {
        const cx = CONFIG.WIDTH / 2;
        const cy = CONFIG.HEIGHT / 2;
        this.ball.reset(cx, cy);
        for (const p of this.players) p.resetToHome();
    }

    _finalizarPartido() {
        this.estado = EstadoPartido.FINALIZADO;
        this.ball.owner = null;
        this.ball.vel.set(0, 0);
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
            p.isSliding = false;
        }

        if (this.golesLocal > this.golesRival) this.cartel = 'VICTORIA';
        else if (this.golesRival > this.golesLocal) this.cartel = 'DERROTA';
        else this.cartel = 'EMPATE';

        this.cartelAlpha = 0;
        this.cartelScale = 0.5;
        this.endMenuSelection = 0;
    }

    getTiempoFormateado() {
        const totalSec = Math.ceil(this.framesRestantes / CONFIG.TARGET_FPS);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    isPlaying() {
        return this.estado === EstadoPartido.EN_JUEGO;
    }

    getLocalTeammates(human) {
        return this.players.filter(p => p.team === 'local' && p !== human);
    }
}

// ============================================================
// PRELOADER
// ============================================================
class Preloader {
    constructor(assetList) {
        this.assets = {};
        this.assetList = assetList;
        this.loaded = 0;
        this.total = assetList.length;
        this.onProgress = null;
        this.onComplete = null;
    }

    load() {
        if (this.total === 0) {
            this.onComplete && this.onComplete(this.assets);
            return;
        }
        this.assetList.forEach(item => this._loadAsset(item));
    }

    _loadAsset(item) {
        const { key, src, type } = item;
        if (type === 'image') {
            const img = new Image();
            img.onload = () => { this.assets[key] = img; this._assetLoaded(key); };
            img.onerror = () => {
                console.error(`[Preloader] Error: ${src}`);
                const ph = this._placeholder(64, 64);
                ph.__missing = true;   // marca de imagen faltante (no se dibuja como cartel)
                this.assets[key] = ph;
                this._assetLoaded(key);
            };
            img.src = CONFIG.ASSETS_PATH + src;
        } else {
            this._assetLoaded(key);
        }
    }

    _assetLoaded(key) {
        this.loaded++;
        const percent = Math.floor((this.loaded / this.total) * 100);
        if (this.onProgress) this.onProgress(percent, key);
        if (this.loaded >= this.total && this.onComplete) this.onComplete(this.assets);
    }

    _placeholder(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, w, h);
        return c;
    }
}

// ============================================================
// GAME
// ============================================================
class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        // Renderizado de alta resolución: mantenemos intactas las coordenadas lógicas
        // del juego (480x640), pero usamos un framebuffer 2x adicional para que el
        // partido se vea mucho más definido al mostrarse grande en PC.
        // En pantallas HiDPI se combina con el DPR real, limitado a 2x para no
        // disparar innecesariamente el consumo de memoria.
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = 2;
        this.canvas.width = Math.round(CONFIG.WIDTH * this.dpr * this.renderScale);
        this.canvas.height = Math.round(CONFIG.HEIGHT * this.dpr * this.renderScale);
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.setTransform(this.dpr * this.renderScale, 0, 0, this.dpr * this.renderScale, 0, 0);

        this.assets = {};
        this.soundtrack = null;
        this._soundtrackStarted = false;
        if (typeof Audio !== 'undefined') {
            this.soundtrack = new Audio('assets/MUSICA-SOUNDTRACK.mp3');
            this.soundtrack.loop = true;
            this.soundtrack.volume = 0.32;
            this.soundtrack.preload = 'auto';
        }
        // Preferencias guardadas (música, volumen, dificultad por defecto, etc.)
        this.prefs = (typeof SettingsStore !== 'undefined') ? SettingsStore.get() : {
            musicEnabled: true, musicVolume: 0.32, sfxEnabled: true, sfxVolume: 0.7,
            defaultDifficulty: 'normal', showHints: true, reduceMotion: false
        };
        this._aplicarPreferencias(this.prefs);
        this.isRunning = false;
        this.lastTime = 0;
        this.accumulator = 0;
        this.frameTime = 1000 / CONFIG.TARGET_FPS;

        this.player = null;
        this.ball = null;
        this.gestor = null;
        this.players = [];

        // Capa de animaciones y game feel (fx.js). Es opcional: si no carga, el juego sigue igual.
        this.fx = (typeof FX !== 'undefined') ? new FX.Mundo(this) : null;

        // Menú final: botones
        this.endButtons = {
            revancha: { x: 0, y: 0, w: 200, h: 48 },
            menu:     { x: 0, y: 0, w: 200, h: 48 }
        };
        this.pauseButtons = {
            continuar: { x: 0, y: 0, w: 240, h: 48 },
            reiniciar: { x: 0, y: 0, w: 240, h: 48 },
            salir: { x: 0, y: 0, w: 240, h: 48 }
        };

        this.loadingBar = document.getElementById('loading-bar');
        this.loadingText = document.getElementById('loading-text');
        this.loadingScreen = document.getElementById('loading-screen');

        this.menuVisible = true;
        // Equipos (assets/equipos.js): el jugador elige el suyo y el rival al tocar JUGAR.
        this.seleccion = { local: 'retoneta', rival: 'el_boguero', dificultad: 'normal' };
        this.modoSeleccion = 'solo';
        this.modoLiga = null;          // {fecha, registrado} mientras se juega un partido de la liga
        this._formatoLiga = 'ida';
        this.liga = (typeof LigaModo !== 'undefined') ? new LigaModo(this) : null;
        this.badgeImgs = {};
        this.enLinea = false;
        this.buscando = false;
        this.socket = null;
        this.miId = '';
        this.rolEnLinea = null;
        this.textoRed = '';
        this._netListo = false;
        this._vistas = new Map();
        this._inputFrame = 0;
        this._inputDirty = false;
        this.teclas = { w: false, a: false, s: false, d: false, espacio: false, shift: false, e: false, q: false };
        this._bindInput();
        this._bindMenu();
        this._bindTouchControls();
        this._bindEspera();
    }


    _aplicarPreferencias(prefs) {
        this.prefs = prefs || this.prefs || {};
        if (this.soundtrack) {
            this.soundtrack.volume = Math.max(0, Math.min(1, Number(this.prefs.musicVolume) || 0.32));
            this.soundtrack.muted = !this.prefs.musicEnabled;
        }
        if (this.prefs.defaultDifficulty) {
            this.dificultadPreferida = this.prefs.defaultDifficulty;
        }
    }

    _bindMenu() {
        const menu = document.getElementById('main-menu');
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        const closeDialog = () => dialog.classList.remove('open');
        document.getElementById('play-hit').addEventListener('click', () => {
            this._abrirModoJuego();
        });
        document.getElementById('mode-solo-hit').addEventListener('click', () => this._elegirModoDesdeMenu('solo'));
        document.getElementById('mode-online-hit').addEventListener('click', () => this._elegirModoDesdeMenu('online'));
        document.getElementById('mode-league-hit').addEventListener('click', () => {
            this._cerrarMenuModos();
            if (this.liga) this.liga.abrirMenu();
        });
        document.getElementById('mode-back-hit').addEventListener('click', () => this._cerrarMenuModos());
        document.addEventListener('keydown', e => {
            const modes = document.getElementById('mode-menu');
            if (e.key === 'Escape' && modes && !modes.hidden) {
                e.preventDefault();
                this._cerrarMenuModos();
            }
        });
        this._bindTeamSelect();
        document.getElementById('rank-hit').addEventListener('click', () => {
            // Ranking vacío por defecto; listo para registro futuro.
            content.classList.add('rk-wide');
            content.classList.remove('cfg-wide');
            const closeRank = () => {
                content.classList.remove('rk-wide');
                closeDialog();
            };
            const pintar = () => {
                if (typeof RankingUI !== 'undefined' && RankingUI.render) {
                    content.innerHTML = RankingUI.render();
                } else {
                    content.innerHTML = '<h2>RANKING DE JUGADORES</h2><p>No se pudo cargar el ranking.</p><button class="action-btn secondary" id="dialog-close">VOLVER</button>';
                }
                const btn = document.getElementById('dialog-close');
                if (btn) btn.addEventListener('click', closeRank);
            };
            pintar();
            dialog.classList.add('open');
            if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) {
                RankingStore.sincronizar().then(() => {
                    if (dialog.classList.contains('open')) pintar();
                });
            }
            const onBackdrop = (e) => {
                if (e.target === dialog) {
                    content.classList.remove('rk-wide');
                    dialog.removeEventListener('click', onBackdrop);
                }
            };
            dialog.addEventListener('click', onBackdrop);
        });
        document.getElementById('settings-hit').addEventListener('click', () => {
            content.classList.add('cfg-wide');
            content.classList.remove('rk-wide');
            const prefs = (typeof SettingsStore !== 'undefined') ? SettingsStore.get() : null;
            if (typeof SettingsUI !== 'undefined' && SettingsUI.render) {
                content.innerHTML = SettingsUI.render(prefs);
            } else {
                content.innerHTML = '<h2>CONFIGURACIÓN</h2><p>No se pudo cargar el panel.</p><button class="action-btn secondary" id="dialog-close">VOLVER</button>';
            }
            dialog.classList.add('open');

            const closeCfg = () => {
                content.classList.remove('cfg-wide');
                closeDialog();
            };

            if (typeof SettingsUI !== 'undefined' && SettingsUI.bind) {
                SettingsUI.bind(content, {
                    onMusicVolume: (v) => {
                        if (this.soundtrack) this.soundtrack.volume = v;
                    },
                    onReset: (defs) => {
                        this._aplicarPreferencias(defs);
                        if (typeof SettingsUI !== 'undefined') {
                            content.innerHTML = SettingsUI.render(defs);
                            SettingsUI.bind(content, {
                                onMusicVolume: (v) => { if (this.soundtrack) this.soundtrack.volume = v; }
                            });
                            const save2 = document.getElementById('settings-save');
                            if (save2) save2.addEventListener('click', () => {
                                const form = SettingsUI.readForm(content);
                                const next = SettingsStore.set(form);
                                this._aplicarPreferencias(next);
                                closeCfg();
                            });
                            const close2 = document.getElementById('dialog-close');
                            if (close2) close2.addEventListener('click', closeCfg);
                        }
                    }
                });
            }

            // Llevar el foco al campo de jugador para poder tipear de una.
            const authName = document.getElementById('cfg-auth-name');
            if (authName) {
                setTimeout(() => {
                    try { authName.focus({ preventScroll: true }); } catch (err) { authName.focus(); }
                }, 0);
            }

            const saveBtn = document.getElementById('settings-save');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (typeof SettingsUI !== 'undefined' && typeof SettingsStore !== 'undefined') {
                        const form = SettingsUI.readForm(content);
                        const next = SettingsStore.set(form);
                        this._aplicarPreferencias(next);
                    }
                    closeCfg();
                });
            }
            const closeBtn = document.getElementById('dialog-close');
            if (closeBtn) closeBtn.addEventListener('click', closeCfg);
            const onBackdrop = (e) => {
                if (e.target === dialog) {
                    content.classList.remove('cfg-wide');
                    dialog.removeEventListener('click', onBackdrop);
                }
            };
            dialog.addEventListener('click', onBackdrop);
        });
        dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
    }

    // JUGAR abre el selector gráfico de modos, con arte distinto para PC y celular.
    _abrirModoJuego() {
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        const modes = document.getElementById('mode-menu');
        if (modes) {
            modes.hidden = false;
            document.getElementById('mode-solo-hit').focus({ preventScroll: true });
        }
        this.modoLiga = null;
    }

    _cerrarMenuModos() {
        const modes = document.getElementById('mode-menu');
        if (modes) modes.hidden = true;
        const play = document.getElementById('play-hit');
        if (play) play.focus({ preventScroll: true });
    }

    _elegirModoDesdeMenu(modo) {
        this._cerrarMenuModos();
        if (modo === 'solo') {
            if (this._teamsAvailable()) this._openTeamSelect('solo');
            else this._startMatchFromMenu();
            return;
        }
        if (modo === 'online') {
            if (this._teamsAvailable()) this._openTeamSelect('online');
            else this._mostrarEsperaRival();
        }
    }

    // --------------------------------------------------------
    // RED (cliente tonto): no simula. Manda teclas y pinta estado_juego.
    // --------------------------------------------------------
    _urlServidor() {
        if (window.LIGA_SERVIDOR) return window.LIGA_SERVIDOR;
        const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
        if (location.protocol !== 'file:' && !local) return location.origin; // producción (Railway)
        if (location.protocol !== 'file:' && location.port === '3001') return location.origin;
        return 'http://127.0.0.1:3001';
    }

    _estadoRed(texto) {
        this.textoRed = texto || '';
        const el = document.getElementById('estado-red');
        if (el) el.textContent = this.textoRed;
        const sub = document.getElementById('espera-sub');
        if (sub && this.textoRed) sub.textContent = this.textoRed;
    }

    _bindEspera() {
        const btn = document.getElementById('espera-cancel');
        if (!btn) return;
        btn.addEventListener('click', () => this._cancelarBusqueda());
    }

    _ocultarEspera() {
        const box = document.getElementById('espera-rival');
        if (box) box.hidden = true;
    }

    _mostrarEsperaRival() {
        this.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        this._closeTeamSelect();
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        const eq = this._equipo(this.seleccion.local);
        const esc = document.getElementById('espera-escudo');
        if (esc) {
            esc.innerHTML = eq
                ? '<img alt="" src="' + this._badgeURL(eq) + '"><p>' + eq.nombre + '</p>'
                : '';
        }
        const box = document.getElementById('espera-rival');
        if (box) box.hidden = false;
        this._jugarEnLinea();
    }

    _cancelarBusqueda() {
        this._salirDeLinea(false);
    }

    _cargarSocketIo() {
        if (window.io) return Promise.resolve();
        const base = this._urlServidor().replace(/\/$/, '');
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = base + '/socket.io/socket.io.js';
            s.onload = () => (window.io ? resolve() : reject(new Error('io')));
            s.onerror = () => reject(new Error('socket.io'));
            document.head.appendChild(s);
        });
    }

    _emitirBusqueda() {
        if (!this.socket || !this.socket.connected || !this.buscando) return;
        const token = (typeof AuthStore !== 'undefined' && AuthStore.tokenActual) ? AuthStore.tokenActual() : '';
        this.socket.emit('buscar_partido', { equipo: this.seleccion.local || '', token: token || '' });
    }

    _jugarEnLinea() {
        this.buscando = true;
        this._estadoRed('Buscando rival...');
        this._cargarSocketIo()
            .then(() => this._conectarYBuscar())
            .catch(() => {
                this.buscando = false;
                this._estadoRed('No hay servidor. Iniciá node server.js');
            });
    }

    _conectarYBuscar() {
        if (!this.buscando) return;
        if (!window.io) {
            this.buscando = false;
            this._estadoRed('No hay servidor. Iniciá node server.js');
            return;
        }
        if (this.socket && this.socket.connected) {
            this._emitirBusqueda();
            return;
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }
        this.socket = window.io(this._urlServidor(), { transports: ['websocket', 'polling'] });
        this.socket.on('connect', () => {
            this.miId = this.socket.id;
            if (this.buscando) this._emitirBusqueda();
        });
        this.socket.on('en_cola', () => {
            this.buscando = true;
            this._estadoRed('Buscando rival...');
        });
        this.socket.on('partido_listo', (data) => this._entrarPartido(data));
        this.socket.on('estado_juego', (data) => {
            if (this.enLinea) this._aplicarEstadoJuego(data);
        });
        this.socket.on('ranking_actualizado', () => {
            if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) RankingStore.sincronizar();
        });
        this.socket.on('sala_destruida', () => {
            this.enLinea = false;
            this.buscando = false;
            this._netListo = false;
            this._showMainMenu();
            this._estadoRed('El rival se desconectó');
        });
        this.socket.on('connect_error', () => {
            if (!this.enLinea) {
                this.buscando = false;
                this._estadoRed('No se pudo conectar al servidor');
            }
        });
    }

    _entrarPartido(data) {
        this.buscando = false;
        this.enLinea = true;
        this._rankingAnotado = false;
        this.rolEnLinea = data && data.rol;
        this.miId = (data && (data.rol === 'Visitante' ? data.visitanteId : data.localId)) || (this.socket && this.socket.id) || '';
        this.menuVisible = false;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        this._ocultarEspera();
        this._estadoRed('');
        this._playSoundtrack();
        this.teclas = { w: false, a: false, s: false, d: false, espacio: false, shift: false, e: false, q: false };
        this._inputDirty = false;
    }

    _salirDeLinea(buscarOtra) {
        this.enLinea = false;
        this.buscando = false;
        this._netListo = false;
        this._vistas.clear();
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        }
        this._estadoRed('');
        if (buscarOtra) this._mostrarEsperaRival();
        else this._showMainMenu();
    }

    _emitirInput() {
        if (!this.socket || !this.socket.connected || !this.enLinea) return;
        this.socket.emit('input', this.teclas);
    }

    _teclaEnLinea(code, down) {
        const map = {
            KeyW: 'w', ArrowUp: 'w',
            KeyS: 's', ArrowDown: 's',
            KeyA: 'a', ArrowLeft: 'a',
            KeyD: 'd', ArrowRight: 'd',
            ShiftLeft: 'shift', ShiftRight: 'shift',
            Space: 'espacio',
            KeyE: 'e',
            KeyQ: 'q'
        };
        const campo = map[code];
        if (!campo) return false;
        this.teclas[campo] = down;
        this._inputDirty = true;
        this._emitirInput();
        return true;
    }

    _aplicarEstadoJuego(data) {
        if (!data || !data.pelota || !Array.isArray(data.jugadores)) return;
        this._netListo = true;
        if (!this.ball) this.ball = new Pelota(data.pelota.x, data.pelota.y);
        this.ball.pos.set(data.pelota.x, data.pelota.y);
        this.ball.vel.set(data.pelota.vx || 0, data.pelota.vy || 0);
        this.ball.owner = null;

        const vistos = new Set();
        const lista = [];
        data.jugadores.forEach((j, i) => {
            const clave = j.id || ((j.rol || 'x') + ':' + i);
            vistos.add(clave);
            let p = this._vistas.get(clave);
            if (!p) {
                p = new Jugador(j.x, j.y, {
                    team: j.rol === 'Visitante' ? 'rival' : 'local',
                    isHuman: false,
                    mobilityId: clave
                });
                this._vistas.set(clave, p);
            }
            p.id = j.id || '';
            p.team = j.rol === 'Visitante' ? 'rival' : 'local';
            p.isHuman = false;
            p.pos.set(j.x, j.y);
            p.vel.set(j.vx || 0, j.vy || 0);
            p.facing.set(j.dirX || 0, j.dirY || (p.team === 'rival' ? 1 : -1));
            p.hasBall = !!j.tienePelota;
            p.isSliding = !!j.deslizando;
            p.sprinting = !!j.sprint && p.vel.length() > 0.15;
            p.moving = p.vel.length() > 0.2;
            p.frozen = data.estado !== 'EN_JUEGO';
            const eqId = p.team === 'rival'
                ? (data.equipos && data.equipos.visitante)
                : (data.equipos && data.equipos.local);
            const eq = this._equipo(eqId);
            if (eq) p.kitName = eq.kit;
            if (p.isSliding && p.slideTimer <= 0) p.slideTimer = CONFIG.SLIDE_DURATION * 0.5;
            if (!p.isSliding) p.slideTimer = 0;
            lista.push(p);
        });
        for (const clave of [...this._vistas.keys()]) {
            if (!vistos.has(clave)) this._vistas.delete(clave);
        }
        this.players = lista;
        const mi = (this.socket && this.socket.id) || this.miId;
        this.player = lista.find(p => p.id && p.id === mi) || null;
        if (data.equipos) {
            if (data.equipos.local) this.seleccion.local = data.equipos.local;
            if (data.equipos.visitante) this.seleccion.rival = data.equipos.visitante;
        }

        if (!this.gestor) this.gestor = new GestorPartido(this.ball, this.players);
        this.gestor.ball = this.ball;
        this.gestor.players = this.players;
        const antes = this.gestor.estado;
        this.gestor.golesLocal = data.marcador ? data.marcador.local : 0;
        this.gestor.golesRival = data.marcador ? data.marcador.visitante : 0;
        this.gestor.framesRestantes = Math.max(0, data.segundos || 0) * CONFIG.TARGET_FPS;
        this.gestor.estado = data.estado === 'CELEBRANDO_GOL'
            ? EstadoPartido.CELEBRANDO_GOL
            : data.estado === 'FINALIZADO'
                ? EstadoPartido.FINALIZADO
                : EstadoPartido.EN_JUEGO;
        this.gestor.pausado = false;
        if (this.gestor.estado === EstadoPartido.CELEBRANDO_GOL && antes !== EstadoPartido.CELEBRANDO_GOL) {
            this.gestor.cartel = 'GOL';
            this.gestor.cartelAlpha = 0;
            this.gestor.cartelScale = 0.4;
        } else if (this.gestor.estado === EstadoPartido.FINALIZADO && antes !== EstadoPartido.FINALIZADO) {
            const mios = this.rolEnLinea === 'Visitante' ? this.gestor.golesRival : this.gestor.golesLocal;
            const suyos = this.rolEnLinea === 'Visitante' ? this.gestor.golesLocal : this.gestor.golesRival;
            this.gestor.cartel = mios > suyos ? 'VICTORIA' : (mios < suyos ? 'DERROTA' : 'EMPATE');
            this.gestor.cartelAlpha = 0;
            this.gestor.cartelScale = 0.5;
            this.gestor.endMenuSelection = 0;
            this._anotarResultadoRanking(this.gestor.cartel);
        } else if (this.gestor.estado === EstadoPartido.EN_JUEGO) {
            this.gestor.cartel = null;
        }
    }

    _cosmeticaEnLinea(dt) {
        for (const p of this.players || []) {
            p.animClock = (p.animClock || 0) + dt;
            if (p.moving) {
                p.animTimer = (p.animTimer || 0) + dt;
                if (p.animTimer > 0.12) {
                    p.animFrame = ((p.animFrame || 0) + 1) % 4;
                    p.animTimer = 0;
                }
            }
            const ax = Math.abs(p.facing.x), ay = Math.abs(p.facing.y);
            if (ax > ay * 1.15) {
                p.animDir = 'side';
                p.flipX = p.facing.x < 0;
            } else {
                p.animDir = p.facing.y < 0 ? 'up' : 'down';
            }
        }
        const g = this.gestor;
        if (g && g.cartel && g.estado !== EstadoPartido.EN_JUEGO) {
            if (g.cartelAlpha < 1) g.cartelAlpha = Math.min(1, g.cartelAlpha + dt * 3);
            if (g.cartelScale < 1.05) g.cartelScale = Math.min(1.05, g.cartelScale + dt * 1.4);
        }
    }

    _esMiJugador(p) {
        if (!this.enLinea) return !!p.isHuman;
        const id = (this.socket && this.socket.id) || this.miId;
        return !!(id && p.id && p.id === id);
    }

    // --------------------------------------------------------
    // SELECCIÓN DE EQUIPO (tocar JUGAR -> elegir equipo -> elegir rival)
    // --------------------------------------------------------
    _teamsAvailable() {
        return typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) && EQUIPOS.length >= 2
            && !!document.getElementById('team-select');
    }

    _equipo(id) {
        if (typeof EQUIPOS === 'undefined') return null;
        return EQUIPOS.find(e => e.id === id) || null;
    }

    _startMatchFromMenu() {
        const menu = document.getElementById('main-menu');
        this.menuVisible = false;
        if (menu) menu.style.display = 'none';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        this._playSoundtrack();
        this._initMatch();
    }

    // Dos equipos "se parecen" si sus dos colores principales son casi iguales (en cualquier orden).
    _equiposParecidos(a, b) {
        const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
        const [a0, a1] = [a.colores[0], a.colores[1] || a.colores[0]];
        const [b0, b1] = [b.colores[0], b.colores[1] || b.colores[0]];
        return Math.min(d(a0, b0) + d(a1, b1), d(a0, b1) + d(a1, b0)) < 90;
    }

    // Escudo de un equipo como SVG (La Retoneta usa su logo propio).
    _badgeSVG(team) {
        const c = team.colores;
        const n = Math.min(3, c.length);
        const w = 100 / n;
        const stripes = c.slice(0, n).map((col, i) => `<rect x="${i * w}" y="0" width="${w + 0.5}" height="120" fill="${col}"/>`).join('');
        const ini = team.siglas.replace(/&/g, '&amp;');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">`
            + `<defs><clipPath id="s"><path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z"/></clipPath></defs>`
            + `<g clip-path="url(#s)">${stripes}</g>`
            + `<path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z" fill="none" stroke="#fff" stroke-width="5"/>`
            + `<path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z" fill="none" stroke="#111" stroke-width="1.5"/>`
            + `<text x="50" y="68" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="38" `
            + `fill="#fff" stroke="#111" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${ini}</text></svg>`;
    }

    _badgeURL(team) {
        return team.logo ? ('assets/' + team.logo) : ('data:image/svg+xml;utf8,' + encodeURIComponent(this._badgeSVG(team)));
    }

    // Imagen del escudo para dibujar en el lienzo (marcador). Se crea una sola vez por equipo.
    _badgeImage(team) {
        if (!team) return null;
        if (team.logo && this.assets && this.assets.retoneta && team.id === 'retoneta') return this.assets.retoneta;
        if (!this.badgeImgs[team.id]) {
            const img = new Image();
            img.src = this._badgeURL(team);
            this.badgeImgs[team.id] = img;
        }
        return this.badgeImgs[team.id];
    }

    _teamSprite(team, canvas) {
        const A = (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null;
        const atlas = this.assets && this.assets.atlas;
        if (!A || !atlas || !atlas.width || !A.kits[team.kit]) return;
        const kit = A.kits[team.kit];
        const f = A.groups[kit.group].frames.P_idle;
        const ctx = canvas.getContext('2d');
        const k = Math.min(canvas.width / f.w, canvas.height / f.h);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(atlas, f.x, f.y + kit.y, f.w, f.h,
            (canvas.width - f.w * k) / 2, canvas.height - f.h * k, f.w * k, f.h * k);
    }

    _openTeamSelect(modo) {
        this.modoSeleccion = modo === 'online' ? 'online' : (modo === 'liga' ? 'liga' : 'solo');
        this._teamStep = 1;
        this._renderTeamSelect();
        document.getElementById('team-select').hidden = false;
        const first = document.querySelector('#ts-grid .ts-tile');
        if (first) first.focus({ preventScroll: true });
    }

    _closeTeamSelect() {
        document.getElementById('team-select').hidden = true;
    }

    _renderTeamSelect() {
        const step = this.modoSeleccion === 'online' ? 1 : (this._teamStep || 1);
        const grid = document.getElementById('ts-grid');
        const title = document.getElementById('ts-title');
        const sub = document.getElementById('ts-sub');
        const mine = this._equipo(this.seleccion.local);
        grid.innerHTML = '';
        grid.classList.toggle('diff-grid', step === 3);
        const rndBtn = document.getElementById('ts-random');
        if (rndBtn) rndBtn.hidden = step === 3;
        if (step === 3) {
            const rival = this._equipo(this.seleccion.rival);
            title.textContent = 'ELEGÍ LA DIFICULTAD';
            sub.textContent = this.modoSeleccion === 'liga'
                ? (mine ? mine.nombre : '') + ' · ¿Qué tan buenos son tus rivales en la liga?'
                : (mine ? mine.nombre : '') + ' vs ' + (rival ? rival.nombre : '') + ' · ¿Qué tan bueno es el rival?';
            document.getElementById('ts-back').textContent = this.modoSeleccion === 'liga' ? 'CAMBIAR MI EQUIPO' : 'CAMBIAR RIVAL';
            DIFICULTAD_ORDEN.forEach((id, i) => {
                const d = DIFICULTADES[id];
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ts-diff ts-diff-' + id + (this.seleccion.dificultad === id ? ' current' : '');
                b.dataset.diff = id;
                b.setAttribute('aria-label', d.nombre + ': ' + d.lema);
                const pips = [0, 1, 2].map(n => '<i class="' + (n <= i ? 'on' : '') + '"></i>').join('');
                b.innerHTML = '<span class="ts-diff-pips">' + pips + '</span>'
                    + '<span class="ts-diff-name">' + d.nombre + '</span>'
                    + '<span class="ts-diff-lema">' + d.lema + '</span>'
                    + '<span class="ts-diff-det">' + d.detalle + '</span>';
                grid.appendChild(b);
            });
            return;
        }
        if (step === 1) {
            title.textContent = 'ELEGÍ TU EQUIPO';
            sub.textContent = this.modoSeleccion === 'online'
                ? 'En línea. Después te quedás esperando a que aparezca un rival.'
                : this.modoSeleccion === 'liga'
                    ? 'Liga offline. Jugás solo tus partidos y el resto se simula.'
                    : (step === 1 ? 'Primero el tuyo. Después elegís al rival.' : 'El rival juega con este equipo.');
        } else {
            title.textContent = 'ELEGÍ TU RIVAL';
            sub.textContent = 'Jugás con ' + (mine ? mine.nombre : '') + ' · ¿Contra quién?';
        }
        document.getElementById('ts-random').textContent = step === 1 ? 'EQUIPO AL AZAR' : 'RIVAL AL AZAR';
        document.getElementById('ts-back').textContent = step === 1 ? 'VOLVER AL MENÚ' : 'CAMBIAR MI EQUIPO';
        for (const team of EQUIPOS) {
            if (step === 2 && mine && team.id === mine.id) continue;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ts-tile';
            b.dataset.id = team.id;
            b.style.setProperty('--c1', team.colores[0]);
            b.style.setProperty('--c2', team.colores[1] || team.colores[0]);
            b.style.setProperty('--c3', team.colores[2] || team.colores[1] || team.colores[0]);
            b.setAttribute('aria-label', team.nombre);
            const similar = step === 2 && mine && this._equiposParecidos(mine, team);
            if (step === 1 && team.id === this.seleccion.local) b.classList.add('current');
            b.innerHTML = '<span class="ts-bar"></span>'
                + '<span class="ts-art"><canvas width="96" height="150" class="ts-sprite"></canvas>'
                + '<img class="ts-badge" alt="" src="' + this._badgeURL(team) + '"></span>'
                + '<span class="ts-name">' + team.nombre + '</span>'
                + (similar ? '<span class="ts-warn">COLORES PARECIDOS</span>' : '');
            this._teamSprite(team, b.querySelector('canvas'));
            grid.appendChild(b);
        }
    }

    _pickTeam(id) {
        if (this.modoSeleccion === 'online') {
            this.seleccion.local = id;
            this._mostrarEsperaRival();
            return;
        }
        if (this._teamStep === 1) {
            this.seleccion.local = id;
            if (this.seleccion.rival === id) this.seleccion.rival = null;
            this._teamStep = this.modoSeleccion === 'liga' ? 3 : 2;   // la liga no elige rival: va a dificultad
            this._renderTeamSelect();
            document.getElementById('team-select').scrollTop = 0;
            const first = document.querySelector('#ts-grid .ts-tile');
            if (first) first.focus({ preventScroll: true });
        } else {
            this.seleccion.rival = id;
            this._teamStep = 3;                       // paso 3: elegir la dificultad
            this._renderTeamSelect();
            document.getElementById('team-select').scrollTop = 0;
            const first = document.querySelector('#ts-grid .ts-diff.current') || document.querySelector('#ts-grid .ts-diff');
            if (first) first.focus({ preventScroll: true });
        }
    }

    _pickDificultad(id) {
        if (!DIFICULTADES[id]) return;
        this.seleccion.dificultad = id;
        if (this.modoSeleccion === 'liga' && this.liga) {
            this._closeTeamSelect();
            this.liga.crearNueva(this.seleccion.local, id);
            return;
        }
        this._startMatchFromMenu();
    }

    // Vuelve un paso atrás en la selección (3 -> 2 -> 1 -> menú).
    _teamBack() {
        if (this.modoSeleccion === 'online') { this._closeTeamSelect(); return; }
        if (this.modoSeleccion === 'liga' && this._teamStep >= 3) { this._teamStep = 1; this._renderTeamSelect(); return; }
        if (this._teamStep >= 2) { this._teamStep--; this._renderTeamSelect(); }
        else this._closeTeamSelect();
    }

    _randomRival() {
        const mine = this._equipo(this.seleccion.local);
        let pool = EQUIPOS.filter(t => !mine || t.id !== mine.id);
        const distintos = pool.filter(t => !mine || !this._equiposParecidos(mine, t));
        if (distintos.length) pool = distintos;       // se evitan camisetas casi iguales
        return pool[Math.floor(Math.random() * pool.length)].id;
    }

    _bindTeamSelect() {
        const root = document.getElementById('team-select');
        if (!root) return;
        root.addEventListener('click', e => {
            const diffBtn = e.target.closest('.ts-diff');
            if (diffBtn) { this._pickDificultad(diffBtn.dataset.diff); return; }
            const tile = e.target.closest('.ts-tile');
            if (tile) { this._pickTeam(tile.dataset.id); return; }
            if (e.target.closest('#ts-random')) {
                if (this._teamStep === 1) this._pickTeam(EQUIPOS[Math.floor(Math.random() * EQUIPOS.length)].id);
                else this._pickTeam(this._randomRival());
            } else if (e.target.closest('#ts-back')) {
                this._teamBack();
            }
        });
        root.addEventListener('keydown', e => {
            if (e.code === 'Escape') {
                this._teamBack();
                e.stopPropagation();
            }
        });
    }

    _showMainMenu() {
        // Si se estaba jugando un partido de la liga, se vuelve a la pantalla de la liga.
        if (this.modoLiga && this.liga && this.liga.liga) {
            this.modoLiga = null;
            this.liga.mostrar();
            return;
        }
        this.modoLiga = null;
        const modeMenu = document.getElementById('mode-menu');
        if (modeMenu) modeMenu.hidden = true;
        if (this.liga) this.liga.ocultar();
        this.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'flex';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        this._ocultarEspera();
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
    }

    _bindTouchControls() {
        const pauseButton = document.getElementById('pause-touch');
        if (pauseButton) pauseButton.addEventListener('click', () => {
            if (this.enLinea) return;
            if (!this.gestor || this.gestor.estado === EstadoPartido.FINALIZADO) return;
            this.gestor.pausado = !this.gestor.pausado;
            this.gestor.pauseMenuSelection = 0;
            this._clearPlayerKeys();
        });

        // Botones de acción (sprint, tiro, pase, cambiar)
        document.querySelectorAll('#touch-controls [data-key]').forEach(button => {
            const code = button.dataset.key;
            const down = e => {
                e.preventDefault();
                if (this.enLinea) {
                    this._teclaEnLinea(code, true);
                    if (button.setPointerCapture && e.pointerId !== undefined) button.setPointerCapture(e.pointerId);
                    return;
                }
                if (!this.player || !this.gestor || !this.gestor.isPlaying()) return;
                if (code === 'Space') this.player.actionSpace(this.ball);
                else if (code === 'KeyE') this.player.actionPass(this.ball, this.gestor.getLocalTeammates(this.player));
                else if (code === 'KeyQ') this._switchPlayer();
                else if (code === 'KeyR') this.player.actionLongPass(this.ball);
                else {
                    const map = {KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ShiftLeft:'shift'};
                    if (map[code]) this.player.keys[map[code]] = true;
                }
                if (button.setPointerCapture && e.pointerId !== undefined) button.setPointerCapture(e.pointerId);
            };
            const up = e => {
                e.preventDefault();
                if (this.enLinea) {
                    this._teclaEnLinea(code, false);
                    return;
                }
                if (!this.player) return;
                if (code === 'Space') this.player.releaseShotCharge(this.ball);
                const map = {KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ShiftLeft:'shift'};
                if (map[code]) this.player.keys[map[code]] = false;
            };
            button.addEventListener('pointerdown', down);
            button.addEventListener('pointerup', up);
            button.addEventListener('pointercancel', up);
            button.addEventListener('lostpointercapture', up);
        });

        // Joystick virtual deslizante (movimiento)
        this._bindVirtualJoystick();
    }

    _bindVirtualJoystick() {
        const stick = document.getElementById('touch-joystick');
        const knob = document.getElementById('joy-knob');
        if (!stick || !knob) return;

        const MAX_RADIUS = 36;       // px que se puede alejar el knob del centro
        const DEADZONE = 0.18;       // zona muerta relativa (0-1)
        let activePointer = null;
        let originX = 0, originY = 0;
        // Últimas direcciones emitidas (para online: solo enviar cambios)
        let lastDirs = { up: false, down: false, left: false, right: false };

        const setKnob = (dx, dy) => {
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const applyDirs = (up, down, left, right) => {
            if (this.enLinea) {
                const pairs = [
                    ['up', 'KeyW', up],
                    ['down', 'KeyS', down],
                    ['left', 'KeyA', left],
                    ['right', 'KeyD', right]
                ];
                for (const [key, code, val] of pairs) {
                    if (lastDirs[key] !== val) {
                        this._teclaEnLinea(code, val);
                        lastDirs[key] = val;
                    }
                }
                return;
            }
            if (!this.player) return;
            this.player.keys.up = up;
            this.player.keys.down = down;
            this.player.keys.left = left;
            this.player.keys.right = right;
            lastDirs = { up, down, left, right };
        };

        const updateFromPoint = (clientX, clientY) => {
            let dx = clientX - originX;
            let dy = clientY - originY;
            const dist = Math.hypot(dx, dy);
            if (dist > MAX_RADIUS) {
                const s = MAX_RADIUS / dist;
                dx *= s;
                dy *= s;
            }
            setKnob(dx, dy);

            const nx = dx / MAX_RADIUS;
            const ny = dy / MAX_RADIUS;
            const mag = Math.hypot(nx, ny);

            if (mag < DEADZONE) {
                applyDirs(false, false, false, false);
                return;
            }

            // Umbral para activar cada eje (permite 8 direcciones cómodas)
            const AXIS = 0.32;
            applyDirs(ny < -AXIS, ny > AXIS, nx < -AXIS, nx > AXIS);
        };

        const onDown = (e) => {
            if (activePointer !== null) return;
            e.preventDefault();
            activePointer = e.pointerId;
            const rect = stick.getBoundingClientRect();
            originX = rect.left + rect.width / 2;
            originY = rect.top + rect.height / 2;
            knob.classList.add('active');
            if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
            updateFromPoint(e.clientX, e.clientY);
        };

        const onMove = (e) => {
            if (e.pointerId !== activePointer) return;
            e.preventDefault();
            updateFromPoint(e.clientX, e.clientY);
        };

        const onUp = (e) => {
            if (e.pointerId !== activePointer && e.type !== 'lostpointercapture') return;
            activePointer = null;
            knob.classList.remove('active');
            setKnob(0, 0);
            applyDirs(false, false, false, false);
        };

        stick.addEventListener('pointerdown', onDown);
        stick.addEventListener('pointermove', onMove);
        stick.addEventListener('pointerup', onUp);
        stick.addEventListener('pointercancel', onUp);
        stick.addEventListener('lostpointercapture', onUp);
    }

    _playSoundtrack() {
        if (!this.soundtrack) return;
        const result = this.soundtrack.play();
        if (result && typeof result.then === 'function') {
            result.then(() => { this._soundtrackStarted = true; }).catch(() => {
                // Los navegadores bloquean autoplay hasta la primera interacción del usuario.
            });
        }
    }

    // --------------------------------------------------------
    // HINCHADA (assets/hinchada/fans.js)
    // Tribunas animadas sobre las gradas pintadas de cancha.webp.
    // Coordenadas en el espacio lógico 480x640 del juego.
    // --------------------------------------------------------
    _initHinchada() {
        this.hinchada = null;
        if (typeof Crowd === 'undefined' || !this.assets || !this.assets.fans) return;
        try {
            const side = 0.4, top = 0.3;   // escala: acorde al tamaño de las gradas pintadas
            const stands = [
                // laterales izquierdos / derechos (arriba y abajo de los banquillos)
                { x: 4,   y: 64,  w: 42, h: 170, scale: side, clip: { x: 2,   y: 62,  w: 46, h: 174 } },
                { x: 3,   y: 396, w: 36, h: 160, scale: side, clip: { x: 2,   y: 394, w: 40, h: 164 } },
                { x: 434, y: 64,  w: 42, h: 170, scale: side, clip: { x: 432, y: 62,  w: 46, h: 174 } },
                { x: 442, y: 396, w: 36, h: 160, scale: side, clip: { x: 440, y: 394, w: 40, h: 164 } },
                // tribuna de fondo (detrás del arco rival)
                { x: 94,  y: 4,   w: 92, h: 46,  scale: top,  clip: { x: 92,  y: 2,   w: 96, h: 48 } },
                { x: 194, y: 4,   w: 94, h: 40,  scale: top,  clip: { x: 192, y: 2,   w: 98, h: 42 } },
                { x: 306, y: 4,   w: 86, h: 46,  scale: top,  clip: { x: 304, y: 2,   w: 90, h: 48 } }
            ];
            this.hinchada = new Crowd({ image: this.assets.fans, stands, seed: 11, waveSpeed: 260, groupChance: 0.2, standChance: 0.45 });
            this._hinchadaChanceT = 0;
        } catch (e) {
            console.warn('[Hinchada] desactivada:', e);
            this.hinchada = null;
        }
    }

    _updateHinchada(dt) {
        const h = this.hinchada;
        if (!h) return;
        if (this.gestor && this.gestor.pausado) return;
        h.update(dt);
        // Tiros peligrosos: la tribuna hace "uuh" cuando la pelota viaja rápido hacia un arco
        const g = this.gestor, b = this.ball;
        this._hinchadaChanceT -= dt;
        if (!g || !b || g.estado !== EstadoPartido.EN_JUEGO || this._hinchadaChanceT > 0) return;
        const sp = Math.hypot(b.vel.x, b.vel.y);
        if (sp < 6) return;
        const haciaNorte = b.vel.y < -3 && b.pos.y < 250 && b.pos.x > 150 && b.pos.x < 330;
        const haciaSur = b.vel.y > 3 && b.pos.y > 390 && b.pos.x > 150 && b.pos.x < 330;
        if (haciaNorte || haciaSur) {
            h.chance(Math.min(1, 0.45 + sp / 20));
            this._hinchadaChanceT = 2.2;
        }
    }

    getAssetManifest() {
        return [
            { key: 'cancha',     src: 'opt/cancha.webp', type: 'image' },
            { key: 'ui_goles',   src: 'opt/ui_goles.webp', type: 'image' },
            { key: 'cartel_GOL',      src: 'ui/gol.png',      type: 'image' },
            { key: 'cartel_VICTORIA', src: 'ui/victoria.png', type: 'image' },
            { key: 'cartel_DERROTA',  src: 'ui/derrota.png',  type: 'image' },
            { key: 'cartel_EMPATE',   src: 'ui/empate.png',   type: 'image' },
            { key: 'ui_rangos',  src: 'opt/ui_rangos.webp', type: 'image' },
            { key: 'pantalla',   src: 'opt/pantalla.webp', type: 'image' },
            { key: 'logo',       src: 'CHAQUITO FUTBOL.jpg', type: 'image' },
            { key: 'retoneta',   src: 'opt/retoneta.webp', type: 'image' },
            // Atlas generado por tools/build_sprites.py (animaciones + 4 equipaciones)
            { key: 'atlas', src: 'sprites/atlas.png', type: 'image' },
            // Hinchada animada (assets/hinchada/fans.js)
            { key: 'fans', src: 'hinchada/fans_atlas.png', type: 'image' },
            // Sprites individuales (respaldo si falta el atlas)
            { key: 'blue_front', src: 'sprites/blue_front.png', type: 'image' },
            { key: 'blue_front2', src: 'sprites/blue_front2.png', type: 'image' },
            { key: 'blue_back',  src: 'sprites/blue_back.png', type: 'image' },
            { key: 'blue_gk',    src: 'sprites/blue_gk.png', type: 'image' },
            { key: 'red_front',  src: 'sprites/red_front.png', type: 'image' },
            { key: 'red_front2', src: 'sprites/red_front2.png', type: 'image' },
            { key: 'red_side',   src: 'sprites/red_side.png', type: 'image' }
        ];
    }

    start() {
        console.log('%c[Liga Chaquito F8] Controles: E pase · R centro · mantener ESPACIO carga el tiro / soltar patea', 'color: #ffcc00; font-weight: bold;');

        const preloader = new Preloader(this.getAssetManifest());
        preloader.onProgress = (percent, key) => {
            if (this.loadingBar) this.loadingBar.style.width = percent + '%';
            if (this.loadingText) this.loadingText.textContent = `Cargando: ${key} (${percent}%)`;
        };
        preloader.onComplete = (assets) => {
            this.assets = assets;
            this._initHinchada();
            this._initMatch();
            this._showMainMenu();
            setTimeout(() => {
                if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
                this.isRunning = true;
                this.lastTime = performance.now();
                requestAnimationFrame(t => this.loop(t));
            }, 350);
        };
        preloader.load();
        if (typeof AuthStore !== 'undefined' && AuthStore.restaurar) {
            AuthStore.restaurar().then(() => {
                if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) RankingStore.sincronizar();
            });
        }
    }

    _anotarResultadoRanking(cartel) {
        if (this._rankingAnotado) return;
        this._rankingAnotado = true;
        if (typeof RankingStore === 'undefined' || !RankingStore.registrarPartido) return;
        const yo = (typeof AuthStore !== 'undefined' && AuthStore.current) ? AuthStore.current() : null;
        if (!yo) return;
        const resultado = cartel === 'VICTORIA' ? 'win' : (cartel === 'DERROTA' ? 'loss' : 'draw');
        const gf = this.gestor ? this.gestor.golesLocal : 0;
        const gc = this.gestor ? this.gestor.golesRival : 0;
        const modo = this.modoLiga ? 'liga' : 'solo';
        RankingStore.registrarPartido(yo.nombre, resultado, null, { gf, gc, modo });
    }

    _initMatch() {
        this._rankingAnotado = false;
        const cx = CONFIG.WIDTH / 2;
        const cy = CONFIG.HEIGHT / 2;

        // AZUL = equipo controlable (local), abajo. ROJO = rival, arriba.
        // Formación inicial simétrica: ambos equipos ocupan las mismas posiciones relativas
        // respecto del centro de la cancha; el rival se espeja verticalmente para no
        // arrancar más cerca del centro que el equipo controlable.
        this.player = new Jugador(cx, 460, { isHuman: true, team: 'local', mobilityId: 'local_0' });

        const localMates = [
            new Jugador(cx - 64, 500, { team: 'local', mobilityId: 'local_1' }),
            new Jugador(cx + 64, 500, { team: 'local', mobilityId: 'local_2' }),
            new Jugador(cx, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }) // arquero
        ];

        // El rival usa exactamente la misma formación relativa, espejada sobre el
        // eje horizontal central: mismos desplazamientos X y misma distancia al centro.
        const rivals = [
            new Jugador(cx, 180,      { team: 'rival', mobilityId: 'rival_0' }),
            new Jugador(cx - 64, 140, { team: 'rival', mobilityId: 'rival_1' }),
            new Jugador(cx + 64, 140, { team: 'rival', mobilityId: 'rival_2' }),
            new Jugador(cx, 95,       { team: 'rival', isGK: true, mobilityId: 'rival_gk' }) // arquero rival
        ];

        this.players = [this.player, ...localMates, ...rivals];
        // Camiseta de cada equipo (colores de assets/equipos.js). Los arqueros conservan la suya.
        const eqLocal = this._equipo(this.seleccion && this.seleccion.local);
        const eqRival = this._equipo(this.seleccion && this.seleccion.rival);
        const dificultad = DIFICULTADES[(this.seleccion && this.seleccion.dificultad) || 'normal'] || DIFICULTADES.normal;
        for (const p of this.players) {
            const eq = p.team === 'local' ? eqLocal : eqRival;
            if (!p.isGK && eq) p.kitName = eq.kit;
            if (p.team === 'rival') p.diff = dificultad;   // el rival juega con el nivel elegido
            // El arquero del jugador usa el perfil de arquero NORMAL siempre: así la dificultad la
            // pone el rival (mejores remates y presión) y no un arquero propio indefenso.
            else if (p.isGK) p.diff = DIFICULTADES.normal;
        }
        this.ball = new Pelota(cx, cy);
        this.gestor = new GestorPartido(this.ball, this.players);
        this.controllableIndex = 0;
    }


    _syncActivePlayerToBall() {
        const owner = this.ball && this.ball.owner;
        if (!owner || owner.team !== 'local' || owner.isGK || owner === this.player) return;
        const locals = this.players.filter(p => p.team === 'local' && !p.isGK);
        const index = locals.indexOf(owner);
        if (index < 0) return;
        if (this.player) {
            this.player.isHuman = false;
            this.player.keys = { up: false, down: false, left: false, right: false, shift: false };
        }
        this.controllableIndex = index;
        this.player = owner;
        this.player.isHuman = true;
        this.player.keys = { up: false, down: false, left: false, right: false, shift: false };
    }

    _switchPlayer() {
        // Solo jugadores de campo del equipo local (no el arquero, más cómodo)
        const locals = this.players.filter(p => p.team === 'local' && !p.isGK);
        if (locals.length < 2) return;

        this.player.isHuman = false;
        this.player.keys = { up: false, down: false, left: false, right: false, shift: false };

        this.controllableIndex = ((this.controllableIndex || 0) + 1) % locals.length;
        this.player = locals[this.controllableIndex];
        this.player.isHuman = true;
        this.player.keys = { up: false, down: false, left: false, right: false, shift: false };
    }

    _bindInput() {
        /** true si el foco está en un campo de texto (login, registro, etc.) */
        const escribiendoEnFormulario = (e) => {
            const t = e && e.target;
            if (!t || !t.tagName) return false;
            const tag = t.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (t.isContentEditable) return true;
            return false;
        };
        /** menú principal, config, ranking u otros overlays HTML abiertos */
        const uiHTMLActiva = () => {
            if (this.menuVisible) return true;
            const dialog = document.getElementById('menu-dialog');
            if (dialog && dialog.classList.contains('open')) return true;
            const team = document.getElementById('team-select');
            if (team && !team.hidden) return true;
            const modes = document.getElementById('mode-menu');
            if (modes && !modes.hidden) return true;
            if (this.liga && this.liga.visible()) return true;
            return false;
        };

        const resumeMusic = () => this._playSoundtrack();
        window.addEventListener('pointerdown', resumeMusic, { once: false });
        window.addEventListener('keydown', resumeMusic, { once: false });
        window.addEventListener('keydown', (e) => {
            // No interceptar teclas mientras se escribe en login / registro / inputs.
            if (escribiendoEnFormulario(e)) return;
            if (this.enLinea && e.code === 'Escape') return;
            const enMenuFinal = this.enLinea && this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO;
            if (this.enLinea && !enMenuFinal && this._teclaEnLinea(e.code, true)) {
                e.preventDefault();
                return;
            }
            if (!this.player || !this.gestor) return;
            // Menú / diálogos HTML: no manejar controles del partido (permite escribir en la cuenta).
            if (uiHTMLActiva()) {
                this._clearPlayerKeys();
                return;
            }
            const k = this.player.keys;
            const g = this.gestor;

            // Pausa del partido: Escape abre/cierra y el menú admite teclado.
            if (e.code === 'Escape' && g.estado !== EstadoPartido.FINALIZADO) {
                e.preventDefault();
                g.pausado = !g.pausado;
                g.pauseMenuSelection = 0;
                this._clearPlayerKeys();
                return;
            }
            if (g.pausado) {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') g.pauseMenuSelection = (g.pauseMenuSelection + 2) % 3;
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') g.pauseMenuSelection = (g.pauseMenuSelection + 1) % 3;
                else if (e.code === 'Enter' || e.code === 'Space') this._handlePauseMenuConfirm();
                e.preventDefault();
                return;
            }

            // Menú de fin de partido
            if (g.estado === EstadoPartido.FINALIZADO) {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') {
                    g.endMenuSelection = 0;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') {
                    g.endMenuSelection = 1;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    this._handleEndMenuConfirm();
                    return;
                }
                return; // bloquea el resto de controles
            }

            switch (e.code) {
                case 'KeyW': case 'ArrowUp':    k.up = true; break;
                case 'KeyS': case 'ArrowDown':  k.down = true; break;
                case 'KeyA': case 'ArrowLeft':  k.left = true; break;
                case 'KeyD': case 'ArrowRight': k.right = true; break;
                case 'ShiftLeft': case 'ShiftRight': k.shift = true; break;

                case 'Space':
                    e.preventDefault();
                    if (g.isPlaying() && !e.repeat) this.player.actionSpace(this.ball);
                    break;

                case 'KeyQ':
                    e.preventDefault();
                    if (g.isPlaying()) this._switchPlayer();
                    break;

                case 'KeyE':
                    e.preventDefault();
                    if (g.isPlaying()) {
                        const mates = g.getLocalTeammates(this.player);
                        this.player.actionPass(this.ball, mates);
                    }
                    break;

                case 'KeyR':
                    e.preventDefault();
                    if (g.isPlaying()) {
                        this.player.actionLongPass(this.ball);
                    }
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (escribiendoEnFormulario(e)) return;
            const enMenuFinal = this.enLinea && this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO;
            if (this.enLinea && !enMenuFinal && this._teclaEnLinea(e.code, false)) {
                e.preventDefault();
                return;
            }
            if (!this.player) return;
            if (uiHTMLActiva()) {
                this._clearPlayerKeys();
                return;
            }
            const k = this.player.keys;
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':    k.up = false; break;
                case 'KeyS': case 'ArrowDown':  k.down = false; break;
                case 'KeyA': case 'ArrowLeft':  k.left = false; break;
                case 'KeyD': case 'ArrowRight': k.right = false; break;
                case 'ShiftLeft': case 'ShiftRight': k.shift = false; break;
                case 'Space':
                    e.preventDefault();
                    if (this.player && this.ball) this.player.releaseShotCharge(this.ball);
                    break;
            }
        });

        // Clic en botones del menú final
        this.canvas.addEventListener('click', (e) => {
            if (!this.gestor) return;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = CONFIG.WIDTH / rect.width;
            const scaleY = CONFIG.HEIGHT / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;

            if (this.gestor.pausado) {
                const b = this.pauseButtons;
                if (this._hit(mx, my, b.continuar)) this.gestor.pauseMenuSelection = 0;
                else if (this._hit(mx, my, b.reiniciar)) this.gestor.pauseMenuSelection = 1;
                else if (this._hit(mx, my, b.salir)) this.gestor.pauseMenuSelection = 2;
                else return;
                this._handlePauseMenuConfirm();
                return;
            }
            if (this.gestor.estado !== EstadoPartido.FINALIZADO) return;
            const b = this.endButtons;
            if (this._hit(mx, my, b.revancha)) {
                this.gestor.endMenuSelection = 0;
                this._handleEndMenuConfirm();
            } else if (this._hit(mx, my, b.menu)) {
                this.gestor.endMenuSelection = 1;
                this._handleEndMenuConfirm();
            }
        });
    }

    _clearPlayerKeys() {
        if (this.player && this.player.keys) {
            this.player.keys = { up: false, down: false, left: false, right: false, shift: false };
            this.player.releaseShotCharge?.(this.ball);
        }
    }

    _handlePauseMenuConfirm() {
        if (!this.gestor || !this.gestor.pausado) return;
        const selection = this.gestor.pauseMenuSelection;
        if (selection === 0) {
            this.gestor.pausado = false;
            this._clearPlayerKeys();
        } else if (selection === 1) {
            this._initMatch();
        } else {
            this._showMainMenu();
        }
    }

    _hit(mx, my, btn) {
        return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
    }

    _handleEndMenuConfirm() {
        const sel = this.gestor.endMenuSelection;
        if (this.enLinea) {
            this._salirDeLinea(sel === 0);
            return;
        }
        if (this.modoLiga) {            // liga: no hay revancha, se vuelve a la tabla
            this._showMainMenu();
            return;
        }
        if (sel === 0) {
            // REVANCHA → nuevo partido
            this._initMatch();
        } else {
            // Volver al menú principal y pausar la simulación.
            this._showMainMenu();
        }
    }

    // --------------------------------------------------------
    // LOOP
    // --------------------------------------------------------
    loop(timestamp) {
        if (!this.isRunning) return;
        const delta = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.accumulator += delta;
        while (this.accumulator >= this.frameTime) {
            this.update(this.frameTime / 1000);
            this.accumulator -= this.frameTime;
        }
        this.render();
        requestAnimationFrame(t => this.loop(t));
    }

    update(dt) {
        this._updateHinchada(dt);
        if (this.enLinea) {
            if (this._netListo) this._cosmeticaEnLinea(dt);
            if (this.fx && this._netListo && this.gestor && !this.gestor.pausado) this.fx.update(dt);
            this._inputFrame++;
            if (this._inputDirty || this._inputFrame % 6 === 0) {
                this._emitirInput();
                this._inputDirty = false;
            }
            return;
        }
        if (!this.gestor || this.menuVisible) return;
        this.gestor.update(dt);
        if (this.modoLiga && !this.modoLiga.registrado && this.gestor.estado === EstadoPartido.FINALIZADO && this.liga) {
            this.modoLiga.registrado = true;
            this.liga.registrarJugado(this.gestor.golesLocal, this.gestor.golesRival);
        }
        if (!this.enLinea && this.gestor.estado === EstadoPartido.FINALIZADO && !this._rankingAnotado) {
            this._anotarResultadoRanking(this.gestor.cartel);
        }
        this._syncActivePlayerToBall();
        if (this.fx && !this.gestor.pausado) this.fx.update(dt);
    }

    // --------------------------------------------------------
    // RENDER
    // --------------------------------------------------------
    render() {
        const ctx = this.ctx;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;

        ctx.clearRect(0, 0, W, H);
        const shaking = this.fx ? this.fx.beginShake(ctx) : false;

        const cancha = this.assets.cancha;
        if (cancha) ctx.drawImage(cancha, 0, 0, W, H);
        else {
            ctx.fillStyle = '#1a5c2a';
            ctx.fillRect(0, 0, W, H);
        }

        if (this.hinchada) this.hinchada.draw(ctx);   // hinchada animada sobre las gradas

        if (this.fx) this.fx.drawUnder(ctx);   // polvo, pasto, ondas

        // Jugadores (rivales primero, luego locales, humano encima)
        const mi = (this.socket && this.socket.id) || this.miId;
        const sorted = [...this.players].sort((a, b) => {
            if (this.enLinea) {
                if (a.id && a.id === mi) return 1;
                if (b.id && b.id === mi) return -1;
            } else {
                if (a.isHuman) return 1;
                if (b.isHuman) return -1;
            }
            return a.pos.y - b.pos.y;
        });
        for (const p of sorted) this._drawPlayer(ctx, p);
        // La interfaz local muestra únicamente la resistencia del jugador
        // manejado por la persona; no revela las barras de compañeros ni rivales.
        for (const p of sorted) {
            if (p.isHuman && !p.isGK && (p.sprinting || p.stamina < CONFIG.STAMINA_MAX - 1)) {
                this._drawStaminaBar(ctx, p);
            }
        }
        for (const p of sorted) if (p.shotCharging) this._drawShotChargeBar(ctx, p);

        if (this.fx) this.fx.drawBallTrail(ctx);
        this._drawBall(ctx);
        this._drawShotAimArrow(ctx);
        if (this.fx) this.fx.drawOver(ctx);    // estrellas, confeti, sudor, chispas
        if (shaking) this.fx.endShake(ctx);
        this._drawMatchUI(ctx);
        this._drawCartel(ctx);
        this._drawPrematchAndCountdown(ctx);

        if (this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO) {
            this._drawEndMenu(ctx);
        }
        if (this.gestor && this.gestor.pausado) this._drawPauseMenu(ctx);
    }

    // Flecha de dirección de tiro mientras se carga el remate
    _drawShotAimArrow(ctx) {
        const p = this.player;
        const ball = this.ball;
        if (!p || !ball || !p.shotCharging || !p.hasBall || ball.owner !== p) return;
        if (!this.gestor || this.gestor.estado !== EstadoPartido.EN_JUEGO) return;

        // Misma lógica de asistencia que patear()
        const goal = new Vector2D(CONFIG.WIDTH / 2,
            p.team === 'local' ? CONFIG.GOAL_NORTH.y + CONFIG.GOAL_NORTH.h / 2
                               : CONFIG.GOAL_SOUTH.y + CONFIG.GOAL_SOUTH.h / 2);
        const goalDir = p.pos.directionTo(goal).normalize();
        const aimDir = p.facing.clone();
        if (aimDir.length() < 0.1) aimDir.copy(goalDir);
        aimDir.normalize();
        const dir = aimDir.scale(0.32).add(goalDir, 0.68).normalize();

        const charge = Math.max(0, Math.min(1, p.shotCharge / p.shotChargeMax));
        const len = 28 + charge * 42;
        const bx = ball.pos.x, by = ball.pos.y;
        const ex = bx + dir.x * len, ey = by + dir.y * len;

        ctx.save();
        ctx.globalAlpha = 0.55 + charge * 0.4;
        // Línea
        ctx.strokeStyle = charge > 0.95 ? '#ff4545' : '#ffcc00';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + dir.x * (ball.radius + 4), by + dir.y * (ball.radius + 4));
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Punta de flecha
        const ang = Math.atan2(dir.y, dir.x);
        const ah = 9 + charge * 4;
        ctx.fillStyle = charge > 0.95 ? '#ff4545' : '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.45) * ah, ey - Math.sin(ang - 0.45) * ah);
        ctx.lineTo(ex - Math.cos(ang + 0.45) * ah, ey - Math.sin(ang + 0.45) * ah);
        ctx.closePath();
        ctx.fill();
        // Anillo de carga alrededor de la pelota
        ctx.strokeStyle = charge > 0.95 ? '#ff4545' : '#ffe36b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, ball.radius + 5 + charge * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
        ctx.stroke();
        ctx.restore();
    }

    _drawPrematchAndCountdown(ctx) {
        const g = this.gestor;
        if (!g) return;
        const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

        if (g.estado === EstadoPartido.PREPARANDO) {
            const t = Math.max(0, g.prematchTimer);
            const progress = 1 - (t / CONFIG.PREMATCH_LOAD_SEC);
            ctx.save();
            ctx.fillStyle = 'rgba(2, 8, 23, 0.72)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 28px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('PREPARANDO PARTIDO', W / 2, H * 0.36);
            ctx.fillStyle = '#e5edf9';
            ctx.font = '14px Courier New';
            ctx.fillText('Cargando controles…', W / 2, H * 0.42);
            // Barra de progreso
            const bw = 220, bh = 14, bx = W / 2 - bw / 2, by = H * 0.48;
            ctx.fillStyle = '#111a2e';
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(bx + 2, by + 2, (bw - 4) * progress, bh - 4);
            ctx.fillStyle = '#aab6c9';
            ctx.font = '12px Courier New';
            ctx.fillText(Math.ceil(t) + 's', W / 2, by + 28);
            // Pista de botones
            ctx.fillStyle = '#9ecbff';
            ctx.font = '11px Courier New';
            ctx.fillText('Joystick · SPRINT · TIRO · PASE · CAMBIAR', W / 2, H * 0.62);
            ctx.restore();
            return;
        }

        if (g.estado === EstadoPartido.CUENTA_REGRESIVA) {
            const n = g.countdownNumber > 0 ? g.countdownNumber : '¡YA!';
            ctx.save();
            ctx.fillStyle = 'rgba(2, 8, 23, 0.35)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 96px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 6;
            const label = String(n);
            ctx.strokeText(label, W / 2, H * 0.45);
            ctx.fillText(label, W / 2, H * 0.45);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px Courier New';
            ctx.fillText('EL PARTIDO COMIENZA', W / 2, H * 0.58);
            ctx.restore();
        }
    }

    _drawPauseMenu(ctx) {
        const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
        const g = this.gestor;
        ctx.save();
        ctx.fillStyle = 'rgba(3, 10, 22, 0.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px Courier New';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('PARTIDO EN PAUSA', W / 2, 190);
        const labels = [
            ['CONTINUAR', 'continuar'],
            ['REINICIAR', 'reiniciar'],
            ['SALIR DEL PARTIDO', 'salir']
        ];
        const y0 = 270, gap = 66, btnW = 260, btnH = 48;
        labels.forEach(([label, key], i) => {
            const btn = { x: (W - btnW) / 2, y: y0 + i * gap, w: btnW, h: btnH };
            this.pauseButtons[key] = btn;
            const selected = g.pauseMenuSelection === i;
            ctx.fillStyle = selected ? '#ffcc00' : 'rgba(20, 35, 55, 0.96)';
            ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
            ctx.fillStyle = selected ? '#111827' : '#ffffff';
            ctx.font = 'bold 18px Courier New';
            ctx.fillText(label, W / 2, btn.y + btn.h / 2);
        });
        ctx.font = '12px Courier New';
        ctx.fillStyle = '#d6deeb';
        ctx.fillText('↑ ↓ PARA ELEGIR  ·  ENTER PARA CONFIRMAR  ·  ESC PARA VOLVER', W / 2, H - 34);
        ctx.restore();
    }

    _drawBall(ctx) {
        const b = this.ball;
        if (!b) return;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(b.pos.x, b.pos.y + 4, b.radius * 0.9, b.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // Estirón de la pelota según su velocidad (fx.js)
        const bs = this.fx ? this.fx.ballStretch() : null;
        if (bs) {
            ctx.save();
            ctx.translate(b.pos.x, b.pos.y);
            ctx.rotate(bs.angle);
            ctx.scale(bs.sx, bs.sy);
            ctx.rotate(-bs.angle);
            ctx.translate(-b.pos.x, -b.pos.y);
        }
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f5f5f5';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Spray de paneles y acentos de color, recortado al contorno de la pelota.
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.pos.x, b.pos.y, b.radius - 0.8, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(b.pos.x, b.pos.y);
        ctx.rotate(Math.atan2(b.vel.y, b.vel.x) + (this.fx ? this.fx.ballSpin : 0));
        ctx.fillStyle = '#252b32';
        ctx.beginPath();
        ctx.moveTo(-2, -8); ctx.lineTo(3, -5); ctx.lineTo(2, -1);
        ctx.lineTo(-3, 1); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5, 1); ctx.lineTo(8, 4); ctx.lineTo(4, 8);
        ctx.lineTo(0, 5); ctx.lineTo(1, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#38a9e8';
        ctx.beginPath(); ctx.arc(-5, 5, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(3, -7); ctx.lineTo(7, -5); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (bs) ctx.restore();
    }

    _drawPlayer(ctx, p) {
        if (!p) return;
        const A = (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null;
        const atlas = this.assets.atlas;
        if (!A || !atlas || !atlas.width) return this._drawPlayerLegacy(ctx, p);

        const kitName = p.isGK ? (p.team === 'local' ? 'gk_local' : 'gk_rival')
            : ((p.kitName && A.kits[p.kitName]) ? p.kitName : p.team);
        const kit = A.kits[kitName];
        const frames = A.groups[kit.group].frames;
        const anims = A.anims[kit.group];
        const X = this.fx ? this.fx.playerPose(p) : null;   // pose extra de fx.js (null = sin efectos)
        const viewDir = (X && X.view) ? X.view.dir : p.animDir;
        const isSide = viewDir === 'side';

        // --- qué cuadro mostrar ---
        let frameName;
        if (X && X.frameName && frames[X.frameName]) {
            frameName = X.frameName;
        } else if (X && X.slide && anims.slide) {
            frameName = anims.slide[Math.min(anims.slide.length - 1, Math.floor(X.slide.prog * anims.slide.length))];
        } else if (p.isGK && anims[p.gkAction]) {
            const actionFrames = anims[p.gkAction];
            const progress = p.gkActionTimer > 0 ? 1 - p.gkActionTimer / (p.gkAction === 'catch' ? 0.34 : 0.48) : 0;
            frameName = actionFrames[Math.min(actionFrames.length - 1, Math.floor(progress * actionFrames.length))];
        } else if (p.isSliding && anims.slide) {
            const prog = 1 - Math.max(0, p.slideTimer) / CONFIG.SLIDE_DURATION;
            frameName = anims.slide[Math.min(anims.slide.length - 1, Math.floor(prog * anims.slide.length))];
        } else if (p.kickTimer > 0 && isSide && anims.kick_side) {
            frameName = anims.kick_side[0];
        } else {
            const list = anims[`${viewDir}_${p.moving ? 'run' : 'idle'}`] || anims.down_idle;
            frameName = list[p.moving ? p.animFrame % list.length : 0];
        }
        const f = frames[frameName] || frames[anims.down_idle[0]];

        const S = A.scale || CONFIG.SPRITE_SCALE;
        const t = p.animClock;
        const footY = p.pos.y + 4;

        // Rebote al correr / respiración parado
        let bob = p.moving
            ? -Math.abs(Math.sin(t * (p.sprinting ? 22 : 15))) * 2.4
            : Math.sin(t * 2.2) * 0.6;
        const dirSign = p.facing.x >= 0 ? 1 : -1;
        let angle = p.moving ? (p.sprinting ? 0.09 : 0.03) * dirSign * (isSide ? 1 : 0.6) : 0;
        let flip = isSide && ((X && X.view) ? X.view.flip : p.flipX);
        if (p.isGK && p.gkAction.startsWith('dive')) flip = p.gkDiveDir < 0;
        let sx = 1, sy = 1, dy = 0;

        // Patada de frente/espalda: estirón corto (de costado ya usa su cuadro propio)
        if (p.kickTimer > 0 && !isSide) {
            const k = p.kickTimer / CONFIG.KICK_ANIM_SEC;
            sx = 1 + 0.12 * k;
            sy = 1 - 0.08 * k;
        }
        // Barrida: el cuadro mira a la derecha; se gira hacia donde se tira
        if (p.isSliding && anims.slide) {
            flip = p.facing.x < 0;
            angle = Math.atan2(p.facing.y, Math.abs(p.facing.x));
            bob = 0;
        }

        // Animaciones extra (fx.js): rebote, inclinación, festejos, tics...
        let px = p.pos.x, shadowK = 1;
        if (X) {
            bob *= X.bobMul; angle += X.angle; sx *= X.sx; sy *= X.sy; dy += X.dy; px += X.dx; shadowK = X.shadow;
            if (X.flipToggle && isSide) flip = !flip;
            if (X.slide) { flip = X.slide.dir < 0; angle = X.angle; bob = 0; }
        }

        if (this._esMiJugador(p)) this._drawPlayerIndicator(ctx, p);

        // Impacto: aplastamiento + flash
        if (p.hitSquash > 0) {
            const k = Math.min(1, p.hitSquash / 0.14);
            sx *= 1 + 0.10 * k;
            sy *= 1 - 0.08 * k;
            bob += 0.6 * k;
        }

        // Sombra (se achica un poco cuando "salta" por el rebote)
        ctx.fillStyle = `rgba(0,0,0,${(0.28 * shadowK).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(px, p.pos.y + 4, Math.max(1, ((p.isSliding || (X && X.slide)) ? 17 : 12) + bob * 0.5) * (0.75 + 0.25 * shadowK), 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Polvo al sprintar
        if (p.moving && p.sprinting) {
            const len = Math.hypot(p.vel.x, p.vel.y) || 1;
            const bx = -p.vel.x / len, by = -p.vel.y / len;
            ctx.fillStyle = 'rgba(230,230,210,0.22)';
            ctx.beginPath(); ctx.arc(p.pos.x + bx * 9, p.pos.y + 3 + by * 6, 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(230,230,210,0.12)';
            ctx.beginPath(); ctx.arc(p.pos.x + bx * 17, p.pos.y + 3 + by * 11, 2.2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.save();
        // Pixel art: mantener el anclaje visual estable en píxeles lógicos.
        // El framebuffer de alta resolución se encarga del escalado final;
        // no suavizamos el atlas porque eso puede producir un pequeño
        // desplazamiento/borrosidad aparente entre frames.
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(px), Math.round(footY + bob + dy));
        ctx.rotate(angle);
        ctx.scale(flip ? -sx : sx, sy);
        if (p.hitFlash > 0) ctx.globalAlpha = 0.82 + 0.18 * Math.sin(performance.now() / 40);
        ctx.drawImage(atlas, f.x, f.y + kit.y, f.w, f.h,
            -f.px * S, -f.py * S, f.w * S, f.h * S);
        if (p.hitFlash > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(255,230,120,0.12)';
            ctx.fillRect(-f.px * S, -f.py * S, f.w * S, f.h * S);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();

        if (p.isGK) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(p.pos.x - 10, p.pos.y + 8, 20, 10);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GK', p.pos.x, p.pos.y + 13);
        }

    }

    // Dibujo anterior (imágenes fijas). Se usa solo si falta el atlas.
    _drawPlayerLegacy(ctx, p) {

        // Elegir sprite estático limpio según equipo / rol / dirección
        let img = null;
        if (p.team === 'local') {
            if (p.isGK) {
                img = this.assets.blue_gk || this.assets.blue_front;
            } else {
                // Según dirección aproximada
                const ax = Math.abs(p.facing.x), ay = Math.abs(p.facing.y);
                if (ay >= ax) {
                    img = (p.facing.y < 0) ? (this.assets.blue_back || this.assets.blue_front)
                                           : (this.assets.blue_front || this.assets.blue_front2);
                } else {
                    img = this.assets.blue_front2 || this.assets.blue_front;
                }
            }
        } else {
            if (p.isGK) {
                img = this.assets.red_front2 || this.assets.red_front;
            } else {
                img = this.assets.red_front || this.assets.red_front2 || this.assets.red_side;
            }
        }

        const drawH = p.isGK ? 66 : 62;
        const drawW = img ? (img.width / img.height) * drawH : 40;
        const drawX = p.pos.x - drawW / 2;
        const drawY = p.pos.y - drawH + 6;

        if (this._esMiJugador(p)) this._drawPlayerIndicator(ctx, p);

        // Sombra
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(p.pos.x, p.pos.y + 3, drawW * 0.28, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (img && img.width) {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } else {
            // fallback círculo
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y - 14, 13, 0, Math.PI * 2);
            ctx.fillStyle = p.team === 'local' ? '#1a6aff' : '#e63939';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Etiqueta GK
        if (p.isGK) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(p.pos.x - 10, p.pos.y + 6, 20, 10);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GK', p.pos.x, p.pos.y + 11);
        }

        if (p.isSliding) {
            ctx.strokeStyle = 'rgba(255, 220, 80, 0.4)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(p.pos.x - p.facing.x * 14, p.pos.y - p.facing.y * 14);
            ctx.lineTo(p.pos.x, p.pos.y);
            ctx.stroke();
        }
    }

    _drawPlayerIndicator(ctx, p) {
        const x = p.pos.x;
        const y = p.pos.y + 10;
        const yb = y + (this.fx ? this.fx.indicatorBounce(p) : 0);   // el triángulo "late"
        if (this.fx) this.fx.drawIndicatorExtras(ctx, p);            // onda al pasar a ser el jugador activo
        ctx.fillStyle = p.hasBall ? 'rgba(50, 220, 80, 0.55)' : 'rgba(255, 210, 40, 0.55)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.hasBall ? '#2ecc40' : '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(x, yb - 5);
        ctx.lineTo(x - 6, yb + 4);
        ctx.lineTo(x + 6, yb + 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _drawMatchUI(ctx) {
        if (!this.gestor) return;
        const W = CONFIG.WIDTH;
        const g = this.gestor;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, 42);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(0, 40, W, 2);

        const eqL = this._equipo(this.seleccion && this.seleccion.local);
        const eqR = this._equipo(this.seleccion && this.seleccion.rival);
        this._drawScoreBox(ctx, 12, 6, g.golesLocal, this._teamColor(eqL, '#3a9bff'), eqL ? eqL.corto : 'LOCAL', eqL);

        const timeStr = g.getTiempoFormateado();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W / 2 - 38, 7, 76, 26);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(W / 2 - 38, 7, 76, 26);
        ctx.fillStyle = g.framesRestantes < 30 * CONFIG.TARGET_FPS ? '#ff4444' : '#ffffff';
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeStr, W / 2, 20);
        if (this.enLinea) {
            ctx.font = 'bold 8px Courier New';
            ctx.fillStyle = '#ffcc00';
            ctx.textAlign = 'center';
            ctx.fillText('EN LÍNEA · ' + (this.rolEnLinea || '').toUpperCase(), W / 2, 37);
        } else {
            const nivel = DIFICULTADES[(this.seleccion && this.seleccion.dificultad) || 'normal'];
            if (nivel) {
                ctx.font = 'bold 8px Courier New';
                ctx.fillStyle = nivel.id === 'dificil' ? '#ff6b5e' : (nivel.id === 'facil' ? '#7be07b' : '#ffcc00');
                ctx.fillText(nivel.nombre, W / 2, 37);
            }
        }

        this._drawScoreBox(ctx, W - 112, 6, g.golesRival, this._teamColor(eqR, '#ff5555'), eqR ? eqR.corto : 'RIVAL', eqR);

        if (g.estado === EstadoPartido.EN_JUEGO) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, CONFIG.HEIGHT - 22, W, 22);
            ctx.fillStyle = '#ccc';
            ctx.font = '9px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('WASD · SHIFT · MANTENER ESPACIO: cargar tiro · SOLTAR: patear · E pase · R centro', W / 2, CONFIG.HEIGHT - 11);
        }
    }

    _drawStaminaBar(ctx, p) {
        const progress = Math.max(0, Math.min(1, p.stamina / CONFIG.STAMINA_MAX));
        // Debajo de los pies del jugador (sin salirse del lienzo)
        const w = 34, h = 5, x = p.pos.x - w / 2, y = Math.min(p.pos.y + 20, CONFIG.HEIGHT - h - 4);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = progress > 0.55 ? '#42d66b' : (progress > 0.25 ? '#ffd43b' : '#ff4545');
        ctx.fillRect(x, y, w * progress, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    _drawShotChargeBar(ctx, p) {
        const progress = Math.max(0, Math.min(1, p.shotCharge / p.shotChargeMax));
        // Debajo de los pies (por debajo de la barra de resistencia, sin salirse del lienzo)
        const w = 46, h = 7, x = p.pos.x - w / 2, y = Math.min(p.pos.y + 46, CONFIG.HEIGHT - 12);
        const full = progress >= 0.98;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(x - 2, y - 11, w + 4, h + 15);
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = full ? (Math.floor(performance.now() / 90) % 2 ? '#ff4545' : '#ffd43b') : '#fff';
        ctx.fillText(full ? '¡MAX!' : 'POTENCIA', p.pos.x, y - 6);
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);
        const gradient = ctx.createLinearGradient(x, y, x + w, y);
        gradient.addColorStop(0, '#42d66b');
        gradient.addColorStop(0.7, '#ffd43b');
        gradient.addColorStop(1, '#ff4545');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w * progress, h);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    // Color del marcador: el más claro de los colores del equipo (para que se lea sobre fondo oscuro).
    _teamColor(team, fallback) {
        if (!team) return fallback;
        const lum = h => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
        return [...team.colores].sort((a, b) => lum(b) - lum(a))[0];
    }

    _drawScoreBox(ctx, x, y, score, color, label, team) {
        const w = team ? 100 : 66;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, y, w, 28);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, 28);
        let tx = x + 5;
        const img = team ? this._badgeImage(team) : null;
        if (img && img.width) {
            // Escudo (La Retoneta usa su logo; sobre fondo claro para que se vea)
            if (team.logo) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x + 3, y + 3, 22, 22);
                ctx.drawImage(img, x + 4, y + 4, 20, 20);
            } else {
                const bh = 22, bw = bh * (img.width / img.height || 0.83);
                ctx.drawImage(img, x + 3 + (22 - bw) / 2, y + 3, bw, bh);
            }
            tx = x + 30;
        }
        ctx.fillStyle = team ? '#ffffff' : color;
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, tx, y + 3);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(String(score), x + w - 6, y + 12);
    }

    _drawCartel(ctx) {
        const g = this.gestor;
        if (!g || !g.cartel) return;
        // En FINALIZADO el menú se dibuja aparte; el cartel de resultado va más arriba
        if (g.estado === EstadoPartido.FINALIZADO) return;

        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const alpha = g.cartelAlpha;
        const scale = g.cartelScale;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2 - 10;
        const sheet = this.assets.ui_goles;
        let drawn = false;

        // Cartel recortado sin fondo (assets/ui/*.png, generado por tools/build_ui.py)
        const cut = this.assets['cartel_' + g.cartel];
        if (cut && !cut.__missing && cut.width > 1) {
            const maxW = 360 * scale;
            const maxH = 190 * scale;
            const k = Math.min(maxW / cut.width, maxH / cut.height);
            const dw = cut.width * k, dh = cut.height * k;
            const wob = g.estado === EstadoPartido.CELEBRANDO_GOL ? Math.sin(performance.now() / 140) * 0.02 : 0;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(wob);
            ctx.drawImage(cut, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
            drawn = true;
        }

        if (!drawn && sheet) {
            const regions = {
                'GOL':      { sx: 35,   sy: 70,  sw: 1190, sh: 445 },
                'VICTORIA': { sx: 1260, sy: 125, sw: 1100, sh: 350 },
                'DERROTA':  { sx: 95,   sy: 575, sw: 1050, sh: 330 },
                'EMPATE':   { sx: 1360, sy: 575, sw: 900,  sh: 320 }
            };
            const reg = regions[g.cartel];
            if (reg) {
                const maxW = 390 * scale;
                const maxH = 180 * scale;
                const ratio = reg.sw / reg.sh;
                const dw = Math.min(maxW, maxH * ratio);
                const dh = dw / ratio;
                ctx.drawImage(sheet, reg.sx, reg.sy, reg.sw, reg.sh, cx - dw / 2, cy - dh / 2, dw, dh);
                drawn = true;
            }
        }

        if (!drawn) {
            const colors = { 'GOL': '#ffcc00', 'VICTORIA': '#2ecc40', 'DERROTA': '#ff4444', 'EMPATE': '#aaaaaa' };
            const label = g.cartel === 'GOL' ? '¡GOL!' : g.cartel;
            ctx.font = `bold ${Math.floor(48 * scale)}px Courier New`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(label, cx + 3, cy + 3);
            ctx.fillStyle = colors[g.cartel] || '#ffcc00';
            ctx.fillText(label, cx, cy);
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.strokeText(label, cx, cy);
        }

        if (g.estado === EstadoPartido.CELEBRANDO_GOL) {
            ctx.font = 'bold 18px Courier New';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`${g.golesLocal}  -  ${g.golesRival}`, cx, cy + 90 * scale);
        }
        ctx.restore();
    }

    /**
     * Menú final grande: REVANCHA / MENÚ PRINCIPAL
     */
    _drawEndMenu(ctx) {
        const g = this.gestor;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const alpha = g.cartelAlpha;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Fondo oscuro
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(0, 0, W, H);

        // Resultado
        const resultColors = { VICTORIA: '#2ecc40', DERROTA: '#ff4444', EMPATE: '#ffcc00' };
        const resultLabel = g.cartel || 'FIN';
        ctx.font = 'bold 42px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(resultLabel, W / 2 + 3, 150 + 3);
        ctx.fillStyle = resultColors[resultLabel] || '#ffcc00';
        ctx.fillText(resultLabel, W / 2, 150);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeText(resultLabel, W / 2, 150);

        // Marcador
        ctx.font = 'bold 28px Courier New';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${g.golesLocal}  -  ${g.golesRival}`, W / 2, 210);

        // Botones grandes
        const btnW = 240;
        const btnH = 52;
        const btnX = (W - btnW) / 2;
        const btn1Y = 300;
        const btn2Y = 370;

        if (this.modoLiga) {
            // Liga: un solo botón, el resultado ya quedó guardado en la tabla.
            g.endMenuSelection = 0;
            this.endButtons.revancha = { x: btnX, y: btn1Y, w: btnW, h: btnH };
            this.endButtons.menu     = { x: -999, y: -999, w: 0, h: 0 };
            ctx.font = '13px Courier New';
            ctx.fillStyle = '#9fe39f';
            ctx.fillText('Resultado guardado en la liga', W / 2, 262);
            this._drawEndButton(ctx, this.endButtons.revancha, 'CONTINUAR', true);
        } else {
            this.endButtons.revancha = { x: btnX, y: btn1Y, w: btnW, h: btnH };
            this.endButtons.menu     = { x: btnX, y: btn2Y, w: btnW, h: btnH };

            this._drawEndButton(ctx, this.endButtons.revancha, 'REVANCHA', g.endMenuSelection === 0);
            this._drawEndButton(ctx, this.endButtons.menu, 'MENÚ PRINCIPAL', g.endMenuSelection === 1);
        }

        // Ayuda
        ctx.font = '11px Courier New';
        ctx.fillStyle = '#888';
        ctx.fillText('↑↓ o W/S para elegir  ·  ENTER o CLIC para confirmar', W / 2, H - 40);

        ctx.restore();
    }

    _drawEndButton(ctx, btn, label, selected) {
        // Fondo
        if (selected) {
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(btn.x - 3, btn.y - 3, btn.w + 6, btn.h + 6);
            ctx.fillStyle = '#1a1a1a';
        } else {
            ctx.fillStyle = 'rgba(30,30,30,0.9)';
        }
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

        // Borde
        ctx.strokeStyle = selected ? '#fff' : '#666';
        ctx.lineWidth = selected ? 3 : 1.5;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

        // Texto
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = selected ? '#ffcc00' : '#cccccc';
        if (selected) {
            // texto sobre fondo oscuro ya pintado
            ctx.fillStyle = '#ffcc00';
        }
        ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game('gameCanvas');
    game.start();
});
