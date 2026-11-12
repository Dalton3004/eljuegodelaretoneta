/**
 * Liga Chaquito F8 - CONFIGURACIÓN (offline / localStorage).
 *
 * Panel detallado de ajustes del menú principal.
 * Secciones: Audio, Controles, Partido, Datos, Acerca de.
 *
 *   SettingsStore -> preferencias en localStorage
 *   SettingsUI    -> HTML del panel (tabs / secciones)
 */
'use strict';

const SettingsStore = (() => {
    const KEY = 'chaquito_settings_v1';
    const VERSION = 1;

    const DEFAULTS = {
        musicEnabled: true,
        musicVolume: 0.32,
        sfxEnabled: true,
        sfxVolume: 0.7,
        defaultDifficulty: 'normal', // facil | normal | dificil
        showHints: true,
        reduceMotion: false
    };

    function leer() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function escribir(data) {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    function get() {
        const data = leer();
        if (data && data.v === VERSION && data.prefs && typeof data.prefs === 'object') {
            return Object.assign({}, DEFAULTS, data.prefs);
        }
        return Object.assign({}, DEFAULTS);
    }

    function set(partial) {
        const actual = get();
        const next = Object.assign({}, actual, partial || {});
        // clamp
        next.musicVolume = Math.max(0, Math.min(1, Number(next.musicVolume) || 0));
        next.sfxVolume = Math.max(0, Math.min(1, Number(next.sfxVolume) || 0));
        if (!['facil', 'normal', 'dificil'].includes(next.defaultDifficulty)) {
            next.defaultDifficulty = 'normal';
        }
        next.musicEnabled = !!next.musicEnabled;
        next.sfxEnabled = !!next.sfxEnabled;
        next.showHints = !!next.showHints;
        next.reduceMotion = !!next.reduceMotion;
        escribir({ v: VERSION, prefs: next, actualizada: Date.now() });
        return next;
    }

    function reset() {
        escribir({ v: VERSION, prefs: Object.assign({}, DEFAULTS), actualizada: Date.now() });
        return Object.assign({}, DEFAULTS);
    }

    return { get, set, reset, DEFAULTS };
})();

const AuthStore = (() => {
    const KEY = 'chaquito_cuentas_v1';
    const SESSION = 'chaquito_sesion_v1';
    const VERSION = 1;

    function leer() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return { v: VERSION, cuentas: [] };
            const data = JSON.parse(raw);
            if (!data || data.v !== VERSION || !Array.isArray(data.cuentas)) return { v: VERSION, cuentas: [] };
            return data;
        } catch (e) {
            return { v: VERSION, cuentas: [] };
        }
    }

    function escribir(data) {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    /** Hash simple para no guardar la contraseña en texto plano. No es un servidor. */
    function hash(s) {
        let h = 2166136261;
        const str = String(s);
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }

    function normalizarNombre(n) {
        return String(n || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    }

    function publica(c) {
        if (!c) return null;
        return { id: c.id, nombre: c.nombre };
    }

    function asegurarRanking(nombre) {
        if (typeof RankingStore === 'undefined' || !RankingStore.lista || !RankingStore.upsert) return;
        const key = String(nombre || '').toLowerCase();
        const existe = RankingStore.lista().some(j => j.nombre.toLowerCase() === key);
        if (!existe) RankingStore.upsert({ nombre, pj: 0, pg: 0, pp: 0, pts: 0 });
    }

    function perfilGuardado() {
        try {
            const raw = localStorage.getItem('chaquito_perfil_v1');
            if (!raw) return null;
            const p = JSON.parse(raw);
            if (!p || !p.nombre) return null;
            return p;
        } catch (e) {
            return null;
        }
    }

    function guardarPerfil(p) {
        try {
            if (!p) localStorage.removeItem('chaquito_perfil_v1');
            else localStorage.setItem('chaquito_perfil_v1', JSON.stringify(p));
        } catch (e) { /* ignore */ }
    }

    function apiBase() {
        if (typeof location === 'undefined') return '';
        if (location.protocol === 'file:') return '';
        if (typeof window !== 'undefined' && window.LIGA_SERVIDOR) {
            return String(window.LIGA_SERVIDOR).replace(/\/$/, '');
        }
        const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
        if (!local) return location.origin;
        if (location.port === '3001') return location.origin;
        return 'http://127.0.0.1:3001';
    }

    function tokenActual() {
        const p = perfilGuardado();
        return p && p.remoto && p.token ? p.token : '';
    }

    async function postJson(path, body, token) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const r = await fetch(apiBase() + path, {
            method: 'POST',
            headers,
            body: JSON.stringify(body || {})
        });
        const data = await r.json().catch(() => ({}));
        return { status: r.status, data };
    }

    function aplicarRemoto(data) {
        const cuenta = data.cuenta || {};
        guardarPerfil({
            id: cuenta.id,
            nombre: cuenta.nombre,
            token: data.token,
            remoto: true
        });
        try { localStorage.setItem(SESSION, cuenta.id || ''); } catch (e) { /* ignore */ }
        if (data.jugador && typeof RankingStore !== 'undefined' && RankingStore.upsert) {
            RankingStore.upsert(data.jugador);
        } else {
            asegurarRanking(cuenta.nombre);
        }
    }

    function current() {
        const remoto = perfilGuardado();
        if (remoto && remoto.remoto && remoto.token) {
            return { id: remoto.id, nombre: remoto.nombre, remoto: true };
        }
        try {
            const id = localStorage.getItem(SESSION);
            if (!id) return null;
            const c = leer().cuentas.find(x => x.id === id);
            return publica(c);
        } catch (e) {
            return null;
        }
    }

    function registerLocal(n, pass) {
        const data = leer();
        if (data.cuentas.some(c => c.nombre.toLowerCase() === n.toLowerCase())) {
            return { ok: false, error: 'Ese jugador ya está registrado en este dispositivo.' };
        }
        const cuenta = {
            id: 'c_' + Date.now().toString(36),
            nombre: n,
            pass: hash(pass),
            creada: Date.now()
        };
        data.cuentas.push(cuenta);
        if (!escribir(data)) return { ok: false, error: 'No se pudo guardar la cuenta en este dispositivo.' };
        guardarPerfil(null);
        try { localStorage.setItem(SESSION, cuenta.id); } catch (e) { /* sesión opcional */ }
        asegurarRanking(n);
        return { ok: true, cuenta: publica(cuenta) };
    }

    async function register(nombre, pass, pass2) {
        const n = normalizarNombre(nombre);
        if (n.length < 3) return { ok: false, error: 'El nombre tiene que tener al menos 3 letras.' };
        if (!pass || String(pass).length < 4) return { ok: false, error: 'La contraseña tiene que tener al menos 4 caracteres.' };
        if (String(pass) !== String(pass2 || '')) return { ok: false, error: 'Las contraseñas no coinciden.' };
        const base = apiBase();
        if (base) {
            try {
                const { data } = await postJson('/api/registro', { nombre: n, password: pass });
                if (!data || !data.ok) return { ok: false, error: (data && data.error) || 'No se pudo registrar.' };
                aplicarRemoto(data);
                return { ok: true, cuenta: data.cuenta, remoto: true };
            } catch (e) {
                /* sin servidor: queda en el dispositivo */
            }
        }
        return registerLocal(n, pass);
    }

    async function login(nombre, pass) {
        const n = normalizarNombre(nombre);
        const base = apiBase();
        if (base) {
            try {
                const { data } = await postJson('/api/login', { nombre: n, password: pass });
                if (data && data.ok) {
                    aplicarRemoto(data);
                    return { ok: true, cuenta: data.cuenta, remoto: true };
                }
                if (data && data.error) return { ok: false, error: data.error };
            } catch (e) {
                /* sin servidor */
            }
        }
        const c = leer().cuentas.find(x => x.nombre.toLowerCase() === n.toLowerCase());
        if (!c || c.pass !== hash(pass)) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
        guardarPerfil(null);
        try { localStorage.setItem(SESSION, c.id); } catch (e) { /* ignore */ }
        asegurarRanking(c.nombre);
        return { ok: true, cuenta: publica(c) };
    }

    function logout() {
        const token = tokenActual();
        const base = apiBase();
        if (token && base) {
            postJson('/api/logout', {}, token).catch(() => {});
        }
        guardarPerfil(null);
        try { localStorage.removeItem(SESSION); } catch (e) { /* ignore */ }
    }

    async function restaurar() {
        const token = tokenActual();
        const base = apiBase();
        if (!token || !base || typeof fetch === 'undefined') return current();
        try {
            const r = await fetch(base + '/api/yo', { headers: { Authorization: 'Bearer ' + token } });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || !data || !data.ok) {
                guardarPerfil(null);
                return null;
            }
            aplicarRemoto(Object.assign({}, data, { token }));
            return current();
        } catch (e) {
            return current();
        }
    }

    async function cargarPartidos() {
        const token = tokenActual();
        const base = apiBase();
        if (!token || !base || typeof fetch === 'undefined') return [];
        try {
            const r = await fetch(base + '/api/partidos', { headers: { Authorization: 'Bearer ' + token } });
            const data = await r.json().catch(() => ({}));
            return data && Array.isArray(data.partidos) ? data.partidos : [];
        } catch (e) {
            return [];
        }
    }

    return { register, login, logout, current, normalizarNombre, apiBase, tokenActual, restaurar, cargarPartidos };
})();

const SettingsUI = (() => {
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function pct(v) {
        return Math.round((Number(v) || 0) * 100);
    }

    /**
     * HTML completo del panel de configuración.
     * Ventana grande, con secciones al estilo de liga / equipos.
     * @param {object} prefs - preferencias actuales (SettingsStore.get())
     */
    function render(prefs) {
        const p = prefs || SettingsStore.get();
        const diff = p.defaultDifficulty || 'normal';

        let h = '<div class="cfg-head">';
        h += '<h2>CONFIGURACIÓN</h2>';
        h += '<p class="rk-sub">Audio · Controles · Partido · Datos</p>';
        h += '</div>';

        // ---- AUDIO ----
        h += '<section class="cfg-section" aria-labelledby="cfg-audio-t">';
        h += '<h3 id="cfg-audio-t" class="cfg-sec-title">🔊 AUDIO</h3>';
        h += '<div class="cfg-row">';
        h += '<label class="cfg-check"><input type="checkbox" id="cfg-music" ' + (p.musicEnabled ? 'checked' : '') + '> Música de fondo</label>';
        h += '<p class="cfg-hint">Soundtrack del menú y del partido.</p>';
        h += '</div>';
        h += '<div class="cfg-row">';
        h += '<label class="cfg-slider-label" for="cfg-music-vol">Volumen música <span id="cfg-music-vol-val">' + pct(p.musicVolume) + '%</span></label>';
        h += '<input type="range" id="cfg-music-vol" min="0" max="100" step="1" value="' + pct(p.musicVolume) + '">';
        h += '</div>';
        h += '<div class="cfg-row">';
        h += '<label class="cfg-check"><input type="checkbox" id="cfg-sfx" ' + (p.sfxEnabled ? 'checked' : '') + '> Efectos de sonido</label>';
        h += '<p class="cfg-hint">Silbato en el saque, gol y toques de pelota.</p>';
        h += '</div>';
        h += '<div class="cfg-row">';
        h += '<label class="cfg-slider-label" for="cfg-sfx-vol">Volumen efectos <span id="cfg-sfx-vol-val">' + pct(p.sfxVolume) + '%</span></label>';
        h += '<input type="range" id="cfg-sfx-vol" min="0" max="100" step="1" value="' + pct(p.sfxVolume) + '">';
        h += '</div>';
        h += '</section>';

        // ---- CONTROLES ----
        h += '<section class="cfg-section" aria-labelledby="cfg-ctrl-t">';
        h += '<h3 id="cfg-ctrl-t" class="cfg-sec-title">🎮 CONTROLES</h3>';
        h += '<div class="cfg-keys">';
        h += '<div class="cfg-key"><kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd><span>Mover</span></div>';
        h += '<div class="cfg-key"><kbd>SHIFT</kbd><span>Sprint</span></div>';
        h += '<div class="cfg-key"><kbd>ESPACIO</kbd><span>Tiro</span></div>';
        h += '<div class="cfg-key"><kbd>E</kbd><span>Pase</span></div>';
        h += '<div class="cfg-key"><kbd>R</kbd><span>Centro / pase largo</span></div>';
        h += '<div class="cfg-key"><kbd>Q</kbd><span>Cambiar jugador</span></div>';
        h += '<div class="cfg-key"><kbd>ESC</kbd><span>Pausa / volver</span></div>';
        h += '</div>';
        h += '<p class="cfg-hint">En celular usás el joystick táctil y los botones de la esquina inferior.</p>';
        h += '</section>';

        // ---- PARTIDO ----
        h += '<section class="cfg-section" aria-labelledby="cfg-match-t">';
        h += '<h3 id="cfg-match-t" class="cfg-sec-title">⚽ PARTIDO</h3>';
        h += '<p class="cfg-hint" style="margin-bottom:8px">Dificultad por defecto al elegir rival (podés cambiarla en cada partido).</p>';
        h += '<div class="cfg-diff" role="radiogroup" aria-label="Dificultad por defecto">';
        h += '<button type="button" class="cfg-diff-btn' + (diff === 'facil' ? ' on' : '') + '" data-diff="facil" id="cfg-diff-facil">';
        h += '<span class="cfg-diff-name facil">FÁCIL</span><span class="cfg-diff-det">Rival más lento, menos presión</span></button>';
        h += '<button type="button" class="cfg-diff-btn' + (diff === 'normal' ? ' on' : '') + '" data-diff="normal" id="cfg-diff-normal">';
        h += '<span class="cfg-diff-name normal">NORMAL</span><span class="cfg-diff-det">Equilibrio estándar</span></button>';
        h += '<button type="button" class="cfg-diff-btn' + (diff === 'dificil' ? ' on' : '') + '" data-diff="dificil" id="cfg-diff-dificil">';
        h += '<span class="cfg-diff-name dificil">DIFÍCIL</span><span class="cfg-diff-det">Rival rápido, presión doble</span></button>';
        h += '</div>';
        h += '<div class="cfg-row" style="margin-top:12px">';
        h += '<label class="cfg-check"><input type="checkbox" id="cfg-hints" ' + (p.showHints ? 'checked' : '') + '> Mostrar pistas de controles</label>';
        h += '</div>';
        h += '<div class="cfg-row">';
        h += '<label class="cfg-check"><input type="checkbox" id="cfg-motion" ' + (p.reduceMotion ? 'checked' : '') + '> Reducir animaciones</label>';
        h += '<p class="cfg-hint">Menos partículas y movimientos de cámara (próximamente).</p>';
        h += '</div>';
        h += '</section>';

        // ---- DATOS ----
        h += '<section class="cfg-section" aria-labelledby="cfg-data-t">';
        h += '<h3 id="cfg-data-t" class="cfg-sec-title">💾 DATOS</h3>';
        h += '<p class="cfg-hint">Las cuentas, el ranking y el historial de partidos se guardan en el servidor. Si no hay servidor, la sesión queda solo en este dispositivo.</p>';
        h += '<div class="cfg-data-actions">';
        h += '<button type="button" class="action-btn secondary cfg-mini" id="cfg-clear-ranking">Borrar copia local del ranking</button>';
        h += '<button type="button" class="action-btn secondary cfg-mini" id="cfg-reset-settings">Restablecer configuración</button>';
        h += '</div>';
        h += '<p class="cfg-note" id="cfg-data-msg" hidden></p>';
        h += '</section>';

        // ---- ACERCA ----
        h += '<section class="cfg-section cfg-about" aria-labelledby="cfg-about-t">';
        h += '<h3 id="cfg-about-t" class="cfg-sec-title">ℹ️ ACERCA DE</h3>';
        h += '<p class="cfg-about-line"><b>Liga Chaquito F8</b></p>';
        h += '<p class="cfg-hint">Fútbol 8 · Canvas HTML5 · Cuentas y ranking en el servidor.</p>';
        h += '<p class="cfg-hint">Victoria 3 pts · Empate 1 pt · Los partidos online los anota el servidor.</p>';
        h += '</section>';

        h += '<div class="cfg-footer">';
        h += '<button type="button" class="action-btn" id="settings-save">GUARDAR</button>';
        h += '<button type="button" class="action-btn secondary" id="dialog-close">VOLVER</button>';
        h += '</div>';

        h += renderAuth();

        return h;
    }

    function renderAuth() {
        const sesion = (typeof AuthStore !== 'undefined') ? AuthStore.current() : null;
        let h = '<section class="cfg-section cfg-auth" id="cfg-auth" aria-labelledby="cfg-auth-t">';
        h += '<h3 id="cfg-auth-t" class="cfg-sec-title">CUENTA DE JUGADOR</h3>';
        if (sesion) {
            h += '<div class="cfg-session">';
            h += '<p class="cfg-session-name">' + esc(sesion.nombre) + '</p>';
            h += '<p class="cfg-hint">' + (sesion.remoto
                ? 'Sesión en el servidor. Los partidos de este jugador quedan en el ranking compartido.'
                : 'Sesión solo en este dispositivo (el servidor no respondió).') + '</p>';
            h += '<ul class="cfg-historial" id="cfg-historial"><li class="cfg-hint">Cargando partidos guardados...</li></ul>';
            h += '<button type="button" class="action-btn secondary cfg-mini" id="cfg-logout">CERRAR SESIÓN</button>';
            h += '</div>';
        } else {
            h += '<p class="cfg-hint">Iniciá sesión o registrate. La cuenta y cada partido terminado se guardan en el servidor.</p>';
            h += '<div class="cfg-auth-tabs" role="tablist">';
            h += '<button type="button" class="cfg-auth-tab on" data-auth="login" id="cfg-tab-login">INICIAR SESIÓN</button>';
            h += '<button type="button" class="cfg-auth-tab" data-auth="register" id="cfg-tab-register">REGISTRARSE</button>';
            h += '</div>';
            h += '<form id="cfg-auth-form" autocomplete="on">';
            h += '<label class="cfg-field"><span>JUGADOR</span><input id="cfg-auth-name" name="username" type="text" maxlength="20" autocomplete="username" placeholder="Tu nombre"></label>';
            h += '<label class="cfg-field"><span>CONTRASEÑA</span><input id="cfg-auth-pass" name="password" type="password" maxlength="40" autocomplete="current-password" placeholder="Mínimo 4 caracteres"></label>';
            h += '<label class="cfg-field cfg-auth-confirm" hidden><span>REPETIR CONTRASEÑA</span><input id="cfg-auth-pass2" type="password" maxlength="40" autocomplete="new-password" placeholder="Repetí la contraseña"></label>';
            h += '<p class="cfg-auth-msg" id="cfg-auth-msg" hidden></p>';
            h += '<button type="submit" class="action-btn" id="cfg-auth-submit">INICIAR SESIÓN</button>';
            h += '</form>';
        }
        h += '</section>';
        return h;
    }

    /**
     * Lee el estado actual del formulario del panel.
     * @returns {object} preferencias parciales
     */
    function readForm(root) {
        const el = root || document;
        const musicVol = el.querySelector('#cfg-music-vol');
        const sfxVol = el.querySelector('#cfg-sfx-vol');
        const diffBtn = el.querySelector('.cfg-diff-btn.on');
        return {
            musicEnabled: !!(el.querySelector('#cfg-music') && el.querySelector('#cfg-music').checked),
            musicVolume: musicVol ? (parseInt(musicVol.value, 10) || 0) / 100 : 0.32,
            sfxEnabled: !!(el.querySelector('#cfg-sfx') && el.querySelector('#cfg-sfx').checked),
            sfxVolume: sfxVol ? (parseInt(sfxVol.value, 10) || 0) / 100 : 0.7,
            defaultDifficulty: diffBtn ? (diffBtn.getAttribute('data-diff') || 'normal') : 'normal',
            showHints: !!(el.querySelector('#cfg-hints') && el.querySelector('#cfg-hints').checked),
            reduceMotion: !!(el.querySelector('#cfg-motion') && el.querySelector('#cfg-motion').checked)
        };
    }

    /**
     * Engancha listeners de UI (sliders, botones de dificultad, vaciar, etc.)
     * Llamar después de innerHTML = SettingsUI.render(...)
     */
    function bind(root, hooks) {
        const el = root || document;
        const h = hooks || {};

        const musicVol = el.querySelector('#cfg-music-vol');
        const musicVal = el.querySelector('#cfg-music-vol-val');
        if (musicVol && musicVal) {
            musicVol.addEventListener('input', () => {
                musicVal.textContent = musicVol.value + '%';
                if (typeof h.onMusicVolume === 'function') h.onMusicVolume(parseInt(musicVol.value, 10) / 100);
            });
        }

        const sfxVol = el.querySelector('#cfg-sfx-vol');
        const sfxVal = el.querySelector('#cfg-sfx-vol-val');
        if (sfxVol && sfxVal) {
            sfxVol.addEventListener('input', () => {
                sfxVal.textContent = sfxVol.value + '%';
            });
        }

        el.querySelectorAll('.cfg-diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.cfg-diff-btn').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
            });
        });

        const clearRk = el.querySelector('#cfg-clear-ranking');
        if (clearRk) {
            clearRk.addEventListener('click', () => {
                if (typeof RankingStore !== 'undefined' && RankingStore.vaciar) {
                    RankingStore.vaciar();
                    const msg = el.querySelector('#cfg-data-msg');
                    if (msg) {
                        msg.hidden = false;
                        msg.textContent = 'Se borró la copia local. El ranking del servidor se vuelve a cargar al abrirlo.';
                    }
                    if (typeof h.onClearRanking === 'function') h.onClearRanking();
                }
            });
        }

        const resetCfg = el.querySelector('#cfg-reset-settings');
        if (resetCfg) {
            resetCfg.addEventListener('click', () => {
                const defs = SettingsStore.reset();
                if (typeof h.onReset === 'function') h.onReset(defs);
                // re-render se maneja afuera si hace falta
                const msg = el.querySelector('#cfg-data-msg');
                if (msg) {
                    msg.hidden = false;
                    msg.textContent = 'Configuración restablecida a valores por defecto.';
                }
            });
        }

        bindAuth(el);
    }

    function bindAuth(el) {
        const box = el.querySelector('#cfg-auth');
        if (!box) return;

        const setMsg = (text, ok) => {
            const msg = box.querySelector('#cfg-auth-msg');
            if (!msg) return;
            msg.hidden = !text;
            msg.textContent = text || '';
            msg.classList.toggle('ok', !!ok);
            msg.classList.toggle('err', !!text && !ok);
        };

        const refresh = () => {
            const parent = box.parentNode;
            const tmp = document.createElement('div');
            tmp.innerHTML = renderAuth();
            const next = tmp.firstElementChild;
            if (parent && next) {
                parent.replaceChild(next, box);
                bindAuth(parent);
            }
        };

        box.querySelectorAll('.cfg-auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                box.querySelectorAll('.cfg-auth-tab').forEach(t => t.classList.remove('on'));
                tab.classList.add('on');
                const modo = tab.getAttribute('data-auth');
                const confirm = box.querySelector('.cfg-auth-confirm');
                const submit = box.querySelector('#cfg-auth-submit');
                const pass = box.querySelector('#cfg-auth-pass');
                if (confirm) confirm.hidden = modo !== 'register';
                if (submit) submit.textContent = modo === 'register' ? 'CREAR CUENTA' : 'INICIAR SESIÓN';
                if (pass) pass.setAttribute('autocomplete', modo === 'register' ? 'new-password' : 'current-password');
                setMsg('');
            });
        });

        const form = box.querySelector('#cfg-auth-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const modo = (box.querySelector('.cfg-auth-tab.on') || {}).getAttribute
                    ? box.querySelector('.cfg-auth-tab.on').getAttribute('data-auth')
                    : 'login';
                const nombre = (box.querySelector('#cfg-auth-name') || {}).value || '';
                const pass = (box.querySelector('#cfg-auth-pass') || {}).value || '';
                const pass2 = (box.querySelector('#cfg-auth-pass2') || {}).value || '';
                const pendiente = modo === 'register'
                    ? AuthStore.register(nombre, pass, pass2)
                    : AuthStore.login(nombre, pass);
                Promise.resolve(pendiente).then((res) => {
                    if (!res || !res.ok) {
                        setMsg((res && res.error) || 'No se pudo entrar.', false);
                        return;
                    }
                    refresh();
                }).catch(() => setMsg('No se pudo guardar la cuenta.', false));
            });
        }

        const out = box.querySelector('#cfg-logout');
        if (out) out.addEventListener('click', () => {
            AuthStore.logout();
            refresh();
        });

        const hist = box.querySelector('#cfg-historial');
        if (hist && AuthStore.cargarPartidos) {
            AuthStore.cargarPartidos().then((lista) => {
                if (!hist.isConnected) return;
                if (!lista.length) {
                    hist.innerHTML = '<li class="cfg-hint">Todavía no hay partidos guardados en el servidor.</li>';
                    return;
                }
                hist.innerHTML = lista.map((p) => {
                    const et = p.resultado === 'win' ? 'Victoria' : (p.resultado === 'loss' ? 'Derrota' : 'Empate');
                    const cuando = p.cuando ? new Date(p.cuando).toLocaleString('es') : '';
                    const modo = p.modo === 'online' ? 'En línea' : (p.modo === 'liga' ? 'Liga' : 'Solo');
                    return '<li><b>' + et + '</b> ' + (p.gf || 0) + '-' + (p.gc || 0) + ' · ' + modo + (cuando ? ' · ' + cuando : '') + '</li>';
                }).join('');
            }).catch(() => {
                if (hist.isConnected) hist.innerHTML = '<li class="cfg-hint">No se pudo leer el historial.</li>';
            });
        }
    }

    return { render, readForm, bind };
})();

if (typeof window !== 'undefined') {
    window.SettingsStore = SettingsStore;
    window.SettingsUI = SettingsUI;
    window.AuthStore = AuthStore;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SettingsStore, SettingsUI, AuthStore };
}
