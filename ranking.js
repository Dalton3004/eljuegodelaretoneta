/**
 * Liga Chaquito F8 - RANKING DE JUGADORES (offline / localStorage).
 *
 * Tabla de los 10 jugadores con más puntos.
 * Columnas: posición, nombre, PJ, PG, PP, PTS.
 *
 * NO se siembran jugadores de demostración.
 * La estructura queda lista para cuando se active el registro:
 *   - RankingStore.upsert / registrarPartido
 *   - RankingUI.render muestra vacío hasta que haya datos reales
 *
 *   RankingCore  -> ordenar / normalizar filas
 *   RankingStore -> localStorage (lista de jugadores)
 *   RankingUI    -> HTML de la tabla para el diálogo del menú
 */
'use strict';

const RankingCore = (() => {
    const TOP = 10;

    /** Normaliza un registro de jugador. */
    function normalizar(j) {
        if (!j || typeof j !== 'object') return null;
        const nombre = String(j.nombre || j.name || '').trim();
        if (!nombre) return null;
        const pj = Math.max(0, parseInt(j.pj, 10) || 0);
        const pg = Math.max(0, parseInt(j.pg, 10) || 0);
        const pp = Math.max(0, parseInt(j.pp, 10) || 0);
        const pts = Math.max(0, parseInt(j.pts, 10) || 0);
        return {
            id: j.id || ('j_' + nombre.toLowerCase().replace(/\s+/g, '_').slice(0, 24)),
            nombre,
            pj, pg, pp, pts,
            // opcionales para el futuro
            pe: Math.max(0, parseInt(j.pe, 10) || 0), // empates
            gf: Math.max(0, parseInt(j.gf, 10) || 0),
            gc: Math.max(0, parseInt(j.gc, 10) || 0)
        };
    }

    /** Orden: más puntos → más ganados → más jugados → nombre. */
    function ordenar(lista) {
        return lista.slice().sort((a, b) =>
            b.pts - a.pts ||
            b.pg - a.pg ||
            b.pj - a.pj ||
            a.nombre.localeCompare(b.nombre, 'es')
        );
    }

    /** Top N con posición 1-based. */
    function topN(lista, n) {
        const ordenados = ordenar(lista.map(normalizar).filter(Boolean));
        const lim = Math.min(n || TOP, ordenados.length);
        const out = [];
        for (let i = 0; i < lim; i++) {
            out.push(Object.assign({ pos: i + 1 }, ordenados[i]));
        }
        return out;
    }

    return { TOP, normalizar, ordenar, topN };
})();

// ============================================================
// GUARDADO
// ============================================================
const RankingStore = (() => {
    const KEY = 'chaquito_ranking_jugadores_v1';
    const VERSION = 2;
    let remoto = false;

    const leer = () => {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    };

    const escribir = (data) => {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    };

    /**
     * Lista actual de jugadores.
     * Si no hay datos (o están corruptos) → array vacío.
     * NO se siembran jugadores demo: el ranking queda listo
     * para cuando se active el registro real.
     */
    function lista() {
        const data = leer();
        if (data && data.v === VERSION && Array.isArray(data.jugadores)) {
            return data.jugadores.map(RankingCore.normalizar).filter(Boolean);
        }
        return [];
    }

    function guardarTodos(jugadores) {
        const limpios = jugadores.map(RankingCore.normalizar).filter(Boolean);
        return escribir({ v: VERSION, jugadores: limpios, actualizada: Date.now() });
    }

    /** Inserta o actualiza un jugador por id / nombre. */
    function upsert(jugador) {
        const j = RankingCore.normalizar(jugador);
        if (!j) return false;
        const todos = lista();
        const idx = todos.findIndex(x => x.id === j.id || x.nombre.toLowerCase() === j.nombre.toLowerCase());
        if (idx >= 0) todos[idx] = Object.assign({}, todos[idx], j);
        else todos.push(j);
        return guardarTodos(todos);
    }

    /** Borra el ranking guardado en este dispositivo. No borra el del servidor. */
    function vaciar() {
        return escribir({ v: VERSION, jugadores: [], actualizada: Date.now() });
    }

    function apiBase() {
        if (typeof AuthStore !== 'undefined' && AuthStore.apiBase) return AuthStore.apiBase();
        return '';
    }

    function token() {
        if (typeof AuthStore !== 'undefined' && AuthStore.tokenActual) return AuthStore.tokenActual();
        return '';
    }

    /** Trae el ranking del servidor y lo deja en la caché local. */
    function sincronizar() {
        const base = apiBase();
        if (!base || typeof fetch === 'undefined') return Promise.resolve(lista());
        return fetch(base + '/api/ranking')
            .then((r) => r.json())
            .then((data) => {
                if (data && Array.isArray(data.jugadores)) {
                    const limpios = data.jugadores.map(RankingCore.normalizar).filter(Boolean);
                    escribir({ v: VERSION, jugadores: limpios, actualizada: Date.now(), remoto: true });
                    remoto = true;
                }
                return lista();
            })
            .catch(() => lista());
    }

    function guardarLocal(nombreOId, resultado, puntos, info) {
        const todos = lista();
        const key = String(nombreOId || '').toLowerCase();
        const j = todos.find(x => x.id === nombreOId || x.nombre.toLowerCase() === key);
        if (!j) return false;
        j.pj += 1;
        if (resultado === 'win') {
            j.pg += 1;
            j.pts += (typeof puntos === 'number' ? puntos : 3);
        } else if (resultado === 'loss') {
            j.pp += 1;
            j.pts += (typeof puntos === 'number' ? puntos : 0);
        } else {
            j.pe = (j.pe || 0) + 1;
            j.pts += (typeof puntos === 'number' ? puntos : 1);
        }
        j.gf = (j.gf || 0) + (parseInt(info.gf, 10) || 0);
        j.gc = (j.gc || 0) + (parseInt(info.gc, 10) || 0);
        return guardarTodos(todos);
    }

    /**
     * Registra el resultado de un partido para un jugador.
     * Con sesión de servidor, el punto lo anota el backend.
     * resultado: 'win' | 'loss' | 'draw'
     */
    function registrarPartido(nombreOId, resultado, puntos, extra) {
        const tok = token();
        const base = apiBase();
        const info = extra && typeof extra === 'object' ? extra : {};
        if (tok && base && typeof fetch !== 'undefined') {
            return fetch(base + '/api/partido', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + tok
                },
                body: JSON.stringify({
                    resultado,
                    gf: info.gf || 0,
                    gc: info.gc || 0,
                    modo: info.modo || 'solo'
                })
            })
                .then((r) => r.json().then((data) => ({ okHttp: r.ok, data })))
                .then(({ okHttp, data }) => {
                    if (data && data.jugador) upsert(data.jugador);
                    if (okHttp && data && data.ok) return sincronizar().then(() => true);
                    return false;
                })
                .catch(() => guardarLocal(nombreOId, resultado, puntos, info));
        }

        return guardarLocal(nombreOId, resultado, puntos, info);
    }

    function esRemoto() {
        return remoto;
    }

    return { lista, guardarTodos, upsert, registrarPartido, vaciar, sincronizar, esRemoto };
})();

// ============================================================
// UI (HTML para el diálogo del menú principal)
// ============================================================
const RankingUI = (() => {
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function posLabel(n) {
        return n + '°';
    }

    /**
     * Genera el HTML completo del ranking (top 10).
     * Se muestra dentro de #dialog-content.
     * Ventana grande y estética; vacío hasta que exista registro.
     */
    function render() {
        const top = RankingCore.topN(RankingStore.lista(), RankingCore.TOP);
        const remoto = RankingStore.esRemoto && RankingStore.esRemoto();

        let h = '<div class="rk-head">';
        h += '<h2>RANKING DE JUGADORES</h2>';
        h += '<p class="rk-sub">' + (remoto
            ? 'Top 10 por puntos · Guardado en el servidor'
            : 'Top 10 por puntos · Se carga del servidor al conectar') + '</p>';
        h += '</div>';

        if (!top.length) {
            h += '<div class="rk-empty-box">';
            h += '<div class="rk-empty-icon" aria-hidden="true">🏆</div>';
            h += '<p class="rk-empty-title">Todavía no hay jugadores</p>';
            h += '<p class="rk-empty">Registrate en Configuración. Cada partido terminado con sesión iniciada suma acá: 3 puntos por victoria y 1 por empate.</p>';
            h += '<ul class="rk-ready-list">';
            h += '<li><b>POS</b> · Posición en el top 10</li>';
            h += '<li><b>PJ</b> · Partidos jugados</li>';
            h += '<li><b>PG / PP</b> · Ganados / Perdidos</li>';
            h += '<li><b>PTS</b> · Puntos guardados en el servidor</li>';
            h += '</ul>';
            h += '</div>';
        } else {
            h += '<div class="rk-scroll"><table class="rk-table" aria-label="Ranking de jugadores">';
            h += '<thead><tr>';
            h += '<th class="rk-pos">POS</th>';
            h += '<th class="rk-name">JUGADOR</th>';
            h += '<th>PJ</th>';
            h += '<th>PG</th>';
            h += '<th>PP</th>';
            h += '<th class="rk-pts">PTS</th>';
            h += '</tr></thead><tbody>';

            for (const r of top) {
                const cls = r.pos === 1 ? ' lider' : (r.pos <= 3 ? ' podium' : '');
                h += '<tr class="' + cls.trim() + '">';
                h += '<td class="rk-pos">' + posLabel(r.pos) + '</td>';
                h += '<td class="rk-name">' + esc(r.nombre) + '</td>';
                h += '<td>' + r.pj + '</td>';
                h += '<td>' + r.pg + '</td>';
                h += '<td>' + r.pp + '</td>';
                h += '<td class="rk-pts">' + r.pts + '</td>';
                h += '</tr>';
            }
            h += '</tbody></table></div>';
        }

        h += '<p class="rk-note">' + (remoto
            ? 'Estos datos viven en el servidor. Sirven en cualquier dispositivo que entre con la misma cuenta.'
            : 'Si el servidor no responde, se muestra la última copia de este dispositivo.') + '</p>';
        h += '<button type="button" class="action-btn secondary" id="dialog-close">VOLVER</button>';
        return h;
    }

    return { render };
})();

// Exponer en global para game.js / pruebas
if (typeof window !== 'undefined') {
    window.RankingCore = RankingCore;
    window.RankingStore = RankingStore;
    window.RankingUI = RankingUI;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RankingCore, RankingStore, RankingUI };
}
