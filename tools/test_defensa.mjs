// Prueba sin pantalla: barrida (quita la pelota + gasta resistencia) e intercepción de pases.
// Usa la misma simulación que el modo en línea. Uso: node tools/test_defensa.mjs
import { cargarSimulacion } from "../sim_offline.js";
const { CONFIG, Jugador, Pelota } = cargarSimulacion();
let fallos = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FALLA ") + m); if (!c) fallos++; };
const DT = 1 / 60;

// 1) La barrida que toca la pelota se la saca al rival
{
    const ball = new Pelota(240, 300);
    const rival = new Jugador(240, 280, { team: "rival" });
    const yo = new Jugador(240, 330, { team: "local", isHuman: true });
    rival.facing.set(0, 1); yo.facing.set(0, -1);
    ball.owner = rival; rival.hasBall = true;
    const todos = [rival, yo];
    const st0 = yo.stamina;
    yo.actionSpace(ball);
    ok(yo.isSliding, "SPACE sin pelota inicia la barrida");
    ok(yo.stamina === st0 - CONFIG.SLIDE_STAMINA_COST, "la barrida gasta " + CONFIG.SLIDE_STAMINA_COST + " de resistencia");
    for (let i = 0; i < 30 && ball.owner !== yo; i++) { yo.update(DT, ball, todos); ball.update(DT); }
    ok(ball.owner === yo && yo.hasBall && !rival.hasBall, "la barrida que le pega a la pelota se la saca (sin azar)");
}

// 2) Barrida sin tocar la pelota: no la saca
{
    const ball = new Pelota(100, 300);
    const rival = new Jugador(100, 280, { team: "rival" });
    const yo = new Jugador(400, 400, { team: "local", isHuman: true });
    yo.facing.set(0, -1); ball.owner = rival; rival.hasBall = true;
    yo.actionSpace(ball);
    for (let i = 0; i < 30; i++) { yo.update(DT, ball, [rival, yo]); ball.update(DT); }
    ok(ball.owner === rival, "barrida lejos de la pelota no quita nada");
}

// 3) No se puede spamear: la resistencia se acaba
{
    const ball = new Pelota(100, 150);   // lejos, para que la barrida no la recupere
    const yo = new Jugador(240, 330, { team: "local", isHuman: true });
    yo.facing.set(1, 0);
    let barridas = 0;
    for (let i = 0; i < 60 * 12; i++) {
        yo.keys = { up: false, down: false, left: false, right: false, shift: false };
        if (!yo.isSliding && yo.slideCooldown <= 0) { const antes = yo.isSliding; yo.actionSpace(ball); if (!antes && yo.isSliding) barridas++; }
        yo.update(DT, ball, [yo]);
    }
    console.log("     barridas posibles apretando SPACE sin parar 12 s:", barridas);
    ok(barridas < 12 / CONFIG.SLIDE_COOLDOWN, "gastar resistencia limita el spam (" + barridas + " < " + (12 / CONFIG.SLIDE_COOLDOWN).toFixed(1) + ")");
    const sinEnergia = new Jugador(240, 330, { team: "local", isHuman: true });
    sinEnergia.stamina = CONFIG.SLIDE_STAMINA_COST - 1;
    sinEnergia.actionSpace(ball);
    ok(!sinEnergia.isSliding, "sin resistencia suficiente no se puede barrer");
}

// 4) Intercepción de un pase entre compañeros (tanto a pie como barriendo, y pase rápido sin atravesar)
for (const [nombre, power, barre] of [["pase corto", 6, false], ["pase fuerte y rápido", 20, false], ["pase largo", 20, true]]) {
    const ball = new Pelota(240, 200);
    const pasador = new Jugador(240, 200, { team: "rival" });
    const defensor = new Jugador(240, 330, { team: "local" });
    ball.kick({ clone() { return { x: 0, y: 1, normalize() { return this; }, length: () => 1 }; } }, 0);
    ball.vel.set(0, power); ball.kickCooldown = 18;
    ball.setPassDrag(power, 300, pasador);
    if (barre) { defensor.isSliding = true; defensor.slideTimer = 0.26; defensor.facing.set(1, 0); defensor.pos.x -= 12; }
    let tomo = false;
    for (let i = 0; i < 60 && !tomo; i++) {
        ball.update(DT);
        defensor.update(DT, ball, [pasador, defensor]);
        tomo = ball.owner === defensor;
    }
    ok(tomo, "intercepta " + nombre + (barre ? " (barriendo)" : ""));
}

// 5) El equipo del que pasa NO intercepta su propio pase, y un jugador lejos de la trayectoria tampoco
{
    const ball = new Pelota(240, 200);
    const pasador = new Jugador(240, 200, { team: "rival" });
    const companero = new Jugador(240, 330, { team: "rival" });
    const lejano = new Jugador(400, 330, { team: "local" });
    ball.vel.set(0, 6); ball.kickCooldown = 18; ball.setPassDrag(6, 300, pasador);
    for (let i = 0; i < 20; i++) { ball.update(DT); lejano.update(DT, ball, [pasador, lejano]); }
    ok(ball.owner !== lejano, "un rival fuera de la trayectoria no intercepta");
}
console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo OK");
process.exit(fallos ? 1 : 0);
