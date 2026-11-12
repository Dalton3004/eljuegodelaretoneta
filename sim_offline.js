/**
 * Liga Chaquito F8 — Simulación OFFLINE reutilizada por el servidor.
 *
 * En vez de mantener una segunda copia (simplificada) de las reglas, el
 * servidor carga la MISMA simulación que usa el modo offline: se lee game.js
 * y se ejecuta el tramo que va desde "CONFIGURACIÓN" hasta "PRELOADER"
 * (CONFIG, DIFICULTADES, EstadoPartido, Vector2D, Pelota, Jugador y
 * GestorPartido). Ese tramo no toca el DOM, así que corre tal cual en Node.
 *
 * Resultado: cualquier cambio que se haga en game.js (física, IA, arqueros,
 * resistencia, barridas, colisiones, cuenta regresiva, festejos…) también
 * rige automáticamente en el modo EN LÍNEA.
 */

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(fileURLToPath(import.meta.url));

function leer(ruta) {
    return readFileSync(join(RAIZ, ruta), "utf8");
}

function extraerSimulacion(fuente) {
    const ini = fuente.indexOf("// CONFIGURACIÓN");
    const fin = fuente.indexOf("// PRELOADER");
    if (ini < 0 || fin < 0 || fin <= ini) {
        throw new Error("sim_offline: no se encontró el tramo de simulación en game.js");
    }
    // Retrocede al inicio de la línea del comentario separador anterior ("// ====")
    const desde = fuente.lastIndexOf("\n", ini - 1) + 1;
    const hasta = fuente.lastIndexOf("\n", fin - 1) + 1;
    return fuente.slice(desde, hasta);
}

export function cargarSimulacion() {
    const codigo = extraerSimulacion(leer("game.js"));

    // assets/movilidad.js asigna window.MOVILIDAD_JUGADORES (velocidad por jugador).
    const sandbox = {
        window: {},
        // actionPass / actionLongPass hacen console.log: en el servidor se silencian.
        console: { log() {}, warn() {}, error: console.error.bind(console) },
        Math,
    };
    vm.createContext(sandbox);
    vm.runInContext(leer("assets/movilidad.js"), sandbox, { filename: "assets/movilidad.js" });
    sandbox.MOVILIDAD_JUGADORES = sandbox.window.MOVILIDAD_JUGADORES;

    const exportar = "\n;({ CONFIG, DIFICULTADES, EstadoPartido, Vector2D, Pelota, Jugador, GestorPartido });";
    return vm.runInContext(codigo + exportar, sandbox, { filename: "game.js(simulacion)" });
}
