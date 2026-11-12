// Prueba sin pantalla: en el modo EN LÍNEA los botones táctiles TIRO y BARRER son independientes.
// Uso: node tools/test_botones_online.mjs
import { Partido } from "../partido_online.js";
let fallos = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FALLA ") + m); if (!c) fallos++; };

const p = new Partido("sala", "A", "B", "x", "y");
for (let i = 0; i < 60 * 8 && p.estado !== "EN_JUEGO"; i++) p.avanzar();
ok(p.estado === "EN_JUEGO", "el partido llega a EN_JUEGO");
const yo = () => p.lados.local.humano;
const suelta = () => { p.ball.owner = null; p.ball.pos.set(60, 150); p.ball.vel.set(0, 0); yo().hasBall = false; yo().stamina = 100; yo().slideCooldown = 0; yo().isSliding = false; yo().hitStun = 0; };
const quieto = { w: false, a: false, s: false, d: false, shift: false };
p.players.filter((j) => j.team === "rival").forEach((j) => { j.frozen = true; });
yo().pos.set(240, 450);

suelta();
p.aplicarInput("A", { ...quieto, tiro: true }); p.avanzar(); p.aplicarInput("A", { ...quieto, tiro: false }); p.avanzar();
ok(!yo().isSliding, "TIRO sin pelota no barre");

suelta();
p.aplicarInput("A", { ...quieto, barrer: true }); p.avanzar();
ok(yo().isSliding, "BARRER sin pelota barre");
ok(yo().stamina <= 100 - 29, "la barrida online gasta resistencia (" + Math.round(yo().stamina) + ")");
p.aplicarInput("A", { ...quieto, barrer: false });

suelta(); yo().stamina = 10;
p.aplicarInput("A", { ...quieto, barrer: true }); p.avanzar(); p.aplicarInput("A", { ...quieto, barrer: false });
ok(!yo().isSliding, "BARRER sin resistencia suficiente no hace nada");

suelta(); p.ball.owner = yo(); yo().hasBall = true; p.ball.pos.set(yo().pos.x, yo().pos.y - 18);
p.aplicarInput("A", { ...quieto, barrer: true }); p.avanzar(); p.aplicarInput("A", { ...quieto, barrer: false });
ok(!yo().isSliding && p.ball.owner === yo(), "BARRER con pelota no barre ni la suelta");
p.aplicarInput("A", { ...quieto, tiro: true }); for (let i = 0; i < 20; i++) p.avanzar();
ok(yo().shotCharging, "TIRO con pelota carga el remate");
p.aplicarInput("A", { ...quieto, tiro: false }); p.avanzar();
ok(p.ball.owner === null && p.ball.vel.length() > 3, "soltar TIRO patea");

// ESPACIO del teclado conserva su comportamiento de siempre (tira con pelota, barre sin pelota)
suelta();
p.aplicarInput("A", { ...quieto, espacio: true }); p.avanzar(); p.aplicarInput("A", { ...quieto, espacio: false });
ok(yo().isSliding, "ESPACIO (teclado) sigue barriendo sin pelota");
console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo OK");
process.exit(fallos ? 1 : 0);
