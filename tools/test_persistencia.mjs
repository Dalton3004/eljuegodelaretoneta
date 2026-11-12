/**
 * Prueba el guardado en disco: registro, login, partido, ranking e historial.
 * Uso: LIGA_DATA=/tmp/liga-test.json node tools/test_persistencia.mjs
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.LIGA_DATA) {
    process.env.LIGA_DATA = join(mkdtempSync(join(tmpdir(), "liga-")), "liga.json");
}

const {
    registrar, entrar, anotarPartido, anotarOnline, listarRanking, historial, cuentaDe, salir,
} = await import("../persistencia.js");

function assert(cond, msg) {
    if (!cond) {
        console.error("FALLO:", msg);
        process.exit(1);
    }
}

const reg = registrar({ nombre: "  Nico  ", password: "1234" });
assert(reg.status === 200 && reg.body.token, "registra");
assert(reg.body.jugador.pts === 0, "arranca en cero");

const dup = registrar({ nombre: "nico", password: "9999" });
assert(dup.status === 409, "nombre repetido");

const mal = entrar({ nombre: "Nico", password: "nope" });
assert(mal.status === 401, "clave mala");

const ok = entrar({ nombre: "Nico", password: "1234" });
assert(ok.status === 200, "login");

const token = ok.body.token;
const p1 = anotarPartido(token, { resultado: "win", gf: 3, gc: 1, modo: "solo" });
assert(p1.status === 200 && p1.body.jugador.pts === 3 && p1.body.jugador.gf === 3, "victoria suma 3");

const p2 = anotarPartido(token, { resultado: "draw", gf: 1, gc: 1, modo: "liga" });
assert(p2.status === 429, "cooldown");

const online = anotarOnline({
    cuentaId: ok.body.cuenta.id,
    resultado: "loss",
    gf: 0,
    gc: 2,
    partidoId: "sala-1",
});
assert(online.ok && online.jugador.pp === 1 && online.jugador.pts === 3, "online anota derrota");

const otra = anotarOnline({
    cuentaId: ok.body.cuenta.id,
    resultado: "win",
    gf: 5,
    gc: 0,
    partidoId: "sala-1",
});
assert(otra.repetido && otra.jugador.pj === 2, "no duplica el mismo partido online");

const top = listarRanking();
assert(top.length === 1 && top[0].nombre === "Nico" && top[0].pj === 2, "ranking");

const hist = historial(token);
assert(hist.status === 200 && hist.body.partidos.length === 2, "historial");
assert(hist.body.partidos[0].modo === "online", "el más nuevo es online");

assert(cuentaDe("token-falso") === null, "token inválido");
salir(token);
assert(cuentaDe(token) === null, "logout");

const anon = anotarPartido("", { resultado: "win" });
assert(anon.status === 401, "sin sesión no anota");

console.log("OK persistencia", process.env.LIGA_DATA);
