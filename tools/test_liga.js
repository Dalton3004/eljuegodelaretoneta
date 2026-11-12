#!/usr/bin/env node
/** Liga Chaquito F8 - prueba sin pantalla del modo LIGA (liga.js). Uso: node tools/test_liga.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');

// --- DOM mínimo ---
const store = {};
const mkEl = () => ({ hidden: true, style: {}, innerHTML: '', textContent: '', scrollTop: 0,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, querySelector: () => mkEl(), querySelectorAll: () => [] });
const els = {};
const sandbox = {
    console, setTimeout, clearTimeout, Math, Date, JSON, Object, Array, Set, Error,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    window: { addEventListener() {} },
    document: { getElementById: id => (els[id] = els[id] || mkEl()) },
};
vm.createContext(sandbox);
const eqSrc = fs.readFileSync(path.join(root, 'assets/equipos.js'), 'utf8');
vm.runInContext(eqSrc + '\n' + fs.readFileSync(path.join(root, 'liga.js'), 'utf8') +
    '\nthis.LigaCore=LigaCore;this.LigaStore=LigaStore;this.LigaModo=LigaModo;this.EQ=EQUIPOS;', sandbox);
const { LigaCore, LigaStore, LigaModo, EQ } = sandbox;
const ids = EQ.map(e => e.id);

// 1) Fixture: cada equipo juega 1 vez por fecha y contra cada rival exactamente una vez (ida) o dos (ida y vuelta)
for (const formato of ['ida', 'idayvuelta']) {
    const L = LigaCore.crear({ ids, miEquipo: 'retoneta', dificultad: 'normal', formato });
    const n = ids.length;
    assert.strictEqual(L.fixture.length, formato === 'ida' ? n - 1 : 2 * (n - 1));
    const vs = {};
    for (const f of L.fixture) {
        assert.strictEqual(f.length, n / 2);
        const vistos = new Set();
        for (const m of f) {
            assert.notStrictEqual(m.l, m.v);
            assert(!vistos.has(m.l) && !vistos.has(m.v), 'equipo repetido en la fecha');
            vistos.add(m.l); vistos.add(m.v);
            const k = [m.l, m.v].sort().join('|');
            vs[k] = (vs[k] || 0) + 1;
        }
        assert(LigaCore.partidoUsuario(L, L.fixture.indexOf(f)), 'el usuario siempre juega');
    }
    assert.strictEqual(Object.keys(vs).length, n * (n - 1) / 2);
    assert(Object.values(vs).every(c => c === (formato === 'ida' ? 1 : 2)));
    console.log('OK fixture', formato, '-', L.fixture.length, 'fechas');
}

// 2) Temporada completa: solo se carga el partido del usuario, el resto se simula
const L = LigaCore.crear({ ids, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });
let pts = 0;
while (!LigaCore.terminada(L)) {
    const m = LigaCore.partidoUsuario(L, L.fechaActual);
    const mio = m.l === 'retoneta';
    m.gl = mio ? 2 : 1; m.gv = mio ? 1 : 2;        // el usuario gana siempre
    pts += 3;
    LigaCore.cerrarFecha(L);
}
const t = LigaCore.tabla(L);
assert.strictEqual(t.length, ids.length);
assert(t.every(r => r.pj === ids.length - 1 && r.g + r.e + r.p === r.pj && r.pts === r.g * 3 + r.e));
assert.strictEqual(t.reduce((a, r) => a + r.gf, 0), t.reduce((a, r) => a + r.gc, 0));
assert.strictEqual(t.find(r => r.id === 'retoneta').pts, pts);
assert.strictEqual(t[0].id, 'retoneta');
console.log('OK temporada completa. Líder:', t[0].id, t[0].pts, 'pts');

// 3) Los goles simulados son razonables
let gol = 0, N = 4000;
const probe = LigaCore.crear({ ids, miEquipo: 'retoneta', formato: 'ida' });
for (let i = 0; i < N; i++) { const m = { l: ids[0], v: ids[1], gl: null, gv: null }; LigaCore.simularPartido(probe, m); gol += m.gl + m.gv; assert(m.gl <= 7 && m.gv <= 7); }
console.log('OK promedio de goles por partido simulado:', (gol / N).toFixed(2));

// 4) Guardado y validación
LigaStore.guardarActual(L);
assert(LigaCore.valida(LigaStore.actual(), ids));
assert(!LigaCore.valida(LigaStore.actual(), ['otro']));
assert(LigaStore.guardar(L)); assert(LigaStore.existe(L.id)); assert.strictEqual(LigaStore.lista().length, 1);
assert(LigaStore.guardar(L)); assert.strictEqual(LigaStore.lista().length, 1);   // no duplica
assert(LigaStore.borrar(L.id)); assert.strictEqual(LigaStore.lista().length, 0);
console.log('OK guardado / carga / borrado');

// 5) La pantalla se dibuja sin errores en cada estado
const game = { menuVisible: false, _equipo: id => EQ.find(e => e.id === id) || null, _badgeURL: () => 'x.png',
    _formatoLiga: 'ida', _showMainMenu() {}, _startMatchFromMenu() { game.arranco = true; }, seleccion: {}, _openTeamSelect() {} };
const ui = new LigaModo(game);
ui.liga = LigaCore.crear({ ids, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });
ui.mostrar(); assert(/TU PRÓXIMO PARTIDO/.test(els['liga-screen'].innerHTML));
ui.jugarPartidoActual(); assert(game.arranco && game.modoLiga.fecha === 0);
ui.registrarJugado(3, 1);
assert.strictEqual(ui.liga.fechaActual, 1);
ui.mostrar(); assert(/FECHA 1/.test(els['liga-screen'].innerHTML) && /<b>3<\/b>|<b>1<\/b>/.test(els['liga-screen'].innerHTML));
ui.tab = 'tabla'; ui.render(); assert(/lg-table/.test(els['liga-screen'].innerHTML));
ui.simularPartidoActual(); assert.strictEqual(ui.liga.fechaActual, 2);
while (!LigaCore.terminada(ui.liga)) ui.simularPartidoActual();
ui.render(); assert(/LIGA TERMINADA/.test(els['liga-screen'].innerHTML) && /lg-final/.test(els['liga-screen'].innerHTML));
ui.guardarTorneo(); assert.strictEqual(LigaStore.lista().length, 1);
console.log('OK pantalla (próximo partido, resultados, tabla, final, guardar)');
console.log('\nTodo OK');
