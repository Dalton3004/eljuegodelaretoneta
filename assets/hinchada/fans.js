/* =====================================================================
 *  fans.js  -  Hinchada pixel art para Liga Chaquito F8 (Canvas 2D)
 *  ---------------------------------------------------------------------
 *  Requiere:  fans_atlas.png  +  fans_atlas.js (define window.FANS_ATLAS)
 *
 *  Uso rapido:
 *    const img   = await Crowd.loadImage('assets/fans_atlas.png');
 *    const crowd = new Crowd({
 *      image: img,
 *      stands: Crowd.surroundPitch({x:40, y:60, w:880, h:440}, {rowsTop:3, rowsBottom:3}),
 *      scale: 1,            // entero (1,2,3...) para no deformar el pixel art
 *    });
 *    // game loop
 *    crowd.update(dt);              // dt en segundos
 *    crowd.draw(ctx);               // dibujar ANTES (detras) de jugadores y pelota
 *    // eventos del partido
 *    crowd.goal('left');            // gol en el arco izquierdo ('right' / {x:..})
 *    crowd.chance(0.7);             // remate peligroso / cerca del arco (0..1)
 *    crowd.setIntensity(0.4);       // 0 calma .. 1 partido caliente
 *
 *  Tamanos (a escala 1): hincha parado ~54px de alto, sentado ~43px.
 *  Un jugador de ~56px de alto queda parejo con un hincha parado.
 * ===================================================================== */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Crowd {
    constructor(opts) {
      opts = opts || {};
      this.atlas = opts.atlas || root.FANS_ATLAS;
      if (!this.atlas) throw new Error('Crowd: falta fans_atlas.js (window.FANS_ATLAS)');
      this.image = opts.image;
      this.scale = opts.scale || 1;
      this.rand = mulberry32(opts.seed || 1337);
      this.emptyChance = opts.emptyChance != null ? opts.emptyChance : 0.1;
      this.groupChance = opts.groupChance != null ? opts.groupChance : 0.28;
      this.standChance = opts.standChance != null ? opts.standChance : 0.4; // % de hinchas que se paran en el gol
      this.goalDuration = opts.goalDuration || 4.6;                          // segundos de festejo
      this.waveSpeed = opts.waveSpeed || 320;                                // px/s de la ola de festejo
      this.stands = [];
      this.now = 0;
      this.intensity = 0;
      this.events = [];
      this.fans = [];
      this._byColor = {};
      this._indexSprites();
      (opts.stands || []).forEach(s => this.addStand(s));
    }

    static loadImage(src) {
      return new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
      });
    }

    /** Arma 2 tribunas (arriba/abajo) alrededor de la cancha. rect = area de juego en px. */
    static surroundPitch(rect, o) {
      o = o || {};
      const rt = o.rowsTop != null ? o.rowsTop : 3, rb = o.rowsBottom != null ? o.rowsBottom : 3;
      const gap = o.gap != null ? o.gap : 4, rowH = o.rowH || 20, s = o.scale || 1;
      const out = [];
      if (rt) out.push({ x: rect.x, y: rect.y - gap * s - (rt - 1) * rowH * s, w: rect.w, rows: rt, rowH: rowH });
      if (rb) out.push({ x: rect.x, y: rect.y + rect.h + gap * s + 43 * s, w: rect.w, rows: rb, rowH: rowH });
      return out;
    }

    // ---------------------------------------------------------- sprites
    _indexSprites() {
      const A = this.atlas, by = (list) => {
        const m = {};
        list.forEach(n => { (m[A.color[n]] = m[A.color[n]] || []).push(n); });
        return m;
      };
      this._by = { calm: by(A.calmSeated), half: by(A.halfSeated), cheer: by(A.cheerSeated), stand: by(A.standing) };
      this._groups = { calm: {}, cheer: {} };
      Object.keys(A.groups).forEach(n => {
        const g = A.groups[n];
        (this._groups[g.mood][g.n] = this._groups[g.mood][g.n] || []).push(n);
      });
      this._colors = Object.keys(by(A.calmSeated.concat(A.halfSeated, A.cheerSeated, A.standing)));
    }

    // Sprite de la misma "persona" (color de remera) para el estado pedido
    _pick(kind, color, r) {
      const m = this._by[kind];
      let list = m[color];
      if (!list) {
        const alt = { navy: 'blue', blue: 'navy' }[color];
        list = (alt && m[alt]) || null;
      }
      if (!list) return null;
      return list[Math.floor(r * list.length) % list.length];
    }

    // ---------------------------------------------------------- layout
    /** stand = {x, y, w, rows, rowH}  ->  y es la base (pies) de la fila de ATRAS. */
    addStand(st) {
      const A = this.atlas, s = st.scale || this.scale, rnd = this.rand;
      const rowH = (st.rowH || 20) * s;
      const rows = st.rows || Math.max(1, Math.floor((st.h - 43 * s) / rowH) + 1);
      const stand = { clip: st.clip || null, fans: [], s: s };
      this.stands.push(stand);
      for (let r = 0; r < rows; r++) {
        const baseY = (st.h != null ? st.y + 43 * s : st.y) + r * rowH; // pies de esta fila
        let x = st.x + Math.floor(rnd() * 10 * s);
        const end = st.x + st.w;
        while (x < end - 20 * s) {
          const isGroup = rnd() < this.groupChance;
          let fan;
          if (isGroup) {
            const n = [2, 2, 2, 3, 3, 4][Math.floor(rnd() * 6)];
            const calmList = this._groups.calm[n], cheerList = this._groups.cheer[n];
            if (!calmList || !cheerList) continue;
            const calm = calmList[Math.floor(rnd() * calmList.length)];
            const cheer = cheerList[Math.floor(rnd() * cheerList.length)];
            const w = A.frames[calm].w * s;
            if (x + w > end) break;
            fan = { kind: 'group', calm, cheer, x: x + w / 2, y: baseY, w };
            x += w;
          } else if (rnd() < this.emptyChance) {
            const f = A.frames[A.seat];
            fan = { kind: 'empty', x: x + f.w * s / 2, y: baseY };
            x += f.w * s;
          } else {
            const color = this._colors[Math.floor(rnd() * this._colors.length)];
            const calmKey = this._pick('calm', color, rnd()) || this._pick('half', color, rnd());
            if (!calmKey) continue;
            const w = A.frames[calmKey].w * s;
            if (x + w > end) break;
            fan = { kind: 'single', color, x: x + w / 2, y: baseY, w };
            fan.calm = calmKey;
            x += w;
          }
          x += Math.floor(rnd() * 5 * s);
          fan.r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
          fan.stander = fan.kind === 'single' && rnd() < this.standChance;
          fan.period = 1.6 + fan.r[0] * 1.2;            // respiracion
          fan.blipEvery = 6 + fan.r[1] * 9;             // cada cuanto levanta la mano solo
          fan.hopT = 0.34 + fan.r[2] * 0.2;             // ritmo de salto
          fan.row = r; fan.s = s; fan.r.push(rnd());
          stand.fans.push(fan); this.fans.push(fan);
        }
      }
      stand.fans.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      this.fans.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    }

    // ---------------------------------------------------------- eventos
    /** side: 'left' | 'right' | {x:px}  - de donde sale la ola de festejo */
    goal(side, o) {
      o = o || {};
      let ox = null, oy = null;
      if (side && typeof side === 'object') { ox = side.x != null ? side.x : null; oy = side.y != null ? side.y : null; }
      else {
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
        this.fans.forEach(f => { minx = Math.min(minx, f.x); maxx = Math.max(maxx, f.x); miny = Math.min(miny, f.y); maxy = Math.max(maxy, f.y); });
        if (side === 'left') ox = minx; else if (side === 'right') ox = maxx;
        else if (side === 'north' || side === 'top') oy = miny; else if (side === 'south' || side === 'bottom') oy = maxy;
      }
      this.events.push({ type: 'goal', t: this.now, x: ox, y: oy, dur: o.duration || this.goalDuration,
        fraction: o.fraction != null ? o.fraction : 1 });
      this.intensity = Math.min(1, this.intensity + 0.3);
    }
    chance(power) {
      this.events.push({ type: 'chance', t: this.now, power: power == null ? 0.6 : power, dur: 1.2 });
    }
    setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }

    // ---------------------------------------------------------- update
    update(dt) {
      this.now += dt;
      this.intensity = Math.max(0, this.intensity - dt * 0.03);
      const keep = this.now - 30;
      if (this.events.length > 8 || (this.events[0] && this.events[0].t < keep))
        this.events = this.events.filter(e => e.t > keep).slice(-8);
    }

    /** Estado de un hincha en este instante -> {level 0..3, power 0..1} */
    _state(f) {
      const now = this.now;
      for (let i = this.events.length - 1; i >= 0; i--) {
        const ev = this.events[i];
        if (ev.type === 'goal') {
          if (f.r[6] > ev.fraction) continue;           // hinchas del otro equipo: no festejan
          const dx = ev.x != null ? f.x - ev.x : 0, dy = ev.y != null ? f.y - ev.y : 0;
          const t = now - ev.t - Math.hypot(dx, dy) / this.waveSpeed - f.r[3] * 0.45;
          if (t < 0) continue;
          const dur = ev.dur * (0.75 + f.r[4] * 0.5);
          if (t < dur) return { level: f.stander ? 3 : 2, power: 1 - 0.45 * (t / dur) };
          if (t < dur + 1.2) return { level: 2, power: 0.3 };
          if (t < dur + 2.2) return { level: 1, power: 0.2 };
        } else {
          const t = now - ev.t - f.r[3] * 0.4;
          if (t >= 0 && t < ev.dur * (0.7 + f.r[5] * 0.6) && f.r[4] < 0.35 + ev.power * 0.65)
            return { level: ev.power > 0.75 ? 2 : 1, power: ev.power * 0.5 };
        }
      }
      const every = f.blipEvery / (1 + this.intensity * 3);
      const ph = (now + f.r[5] * 40) % every;
      if (ph < 0.7) return { level: 1, power: 0.1 };
      return { level: 0, power: 0 };
    }

    // ---------------------------------------------------------- draw
    _blit(ctx, name, cx, by, flip, dy, s) {
      const fr = this.atlas.frames[name]; s = s || this.scale;
      const w = fr.w * s, h = fr.h * s;
      const x = s >= 1 ? Math.round(cx - w / 2) : cx - w / 2, y = s >= 1 ? Math.round(by - h + dy) : by - h + dy;
      if (flip) {
        ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1);
        ctx.drawImage(this.image, fr.x, fr.y, fr.w, fr.h, 0, 0, w, h);
        ctx.restore();
      } else ctx.drawImage(this.image, fr.x, fr.y, fr.w, fr.h, x, y, w, h);
    }

    draw(ctx) {
      const A = this.atlas, now = this.now;
      const prev = ctx.imageSmoothingEnabled;
      for (const stand of this.stands) {
        const sc = stand.s;
        // escalas < 1 se suavizan para evitar "salteo" de pixeles; >= 1 queda pixel perfect
        ctx.imageSmoothingEnabled = sc < 1;
        if (sc < 1 && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.save();
        if (stand.clip) { ctx.beginPath(); ctx.rect(stand.clip.x, stand.clip.y, stand.clip.w, stand.clip.h); ctx.clip(); }
        for (const f of stand.fans) this._drawFan(ctx, f, A, now, f.s);
        ctx.restore();
      }
      ctx.imageSmoothingEnabled = prev;
    }

    _drawFan(ctx, f, A, now, s) {
      if (f.kind === 'empty') { this._blit(ctx, A.seat, f.x, f.y, false, 0, s); return; }
      const st = this._state(f);
      let name, dy = 0, flip = false;
      if (f.kind === 'group') {
        if (st.level >= 2) {
          name = f.cheer;
          dy = -(Math.floor(now / f.hopT + f.r[0] * 4) % 2) * 2 * s * (st.level === 3 ? 1 : 0.5);
          flip = Math.floor(now / (f.hopT * 2) + f.r[1] * 4) % 2 === 1;
        } else {
          name = f.calm;
          dy = st.level === 1 ? -(Math.floor(now / 0.3 + f.r[0] * 4) % 2) * s : 0;
        }
        this._blit(ctx, name, f.x, f.y, flip, dy, s);
        return;
      }
      if (st.level === 3) {
        const stand = this._pick('stand', f.color, f.r[2]) || this._pick('cheer', f.color, f.r[2]) || f.calm;
        const T = f.hopT * 1.25;
        const ph = ((now / T) + f.r[0]) % 1;
        dy = -Math.sin(ph * Math.PI) * 11 * s * st.power;
        flip = Math.floor(now / (T * 2) + f.r[1] * 4) % 2 === 1;
        this._blit(ctx, A.seat, f.x - f.w / 2 + 9 * s, f.y, false, 0, s);   // la butaca queda vacia
        this._blit(ctx, stand, f.x + 2 * s, f.y, flip, dy, s);
      } else if (st.level === 2) {
        name = this._pick('cheer', f.color, f.r[2]) || f.calm;
        dy = -(Math.floor(now / f.hopT + f.r[0] * 4) % 2) * 2 * s * (0.5 + st.power * 0.5);
        flip = Math.floor(now / (f.hopT * 2) + f.r[1] * 4) % 2 === 1;
        this._blit(ctx, name, f.x, f.y, flip, dy, s);
      } else if (st.level === 1) {
        name = this._pick('half', f.color, f.r[2]) || f.calm;
        dy = -(Math.floor(now / 0.35 + f.r[0] * 4) % 2) * s;
        flip = Math.floor(now / 0.7 + f.r[1] * 4) % 2 === 1 && name !== f.calm;
        this._blit(ctx, name, f.x, f.y, flip, dy, s);
      } else {
        dy = (Math.floor(now / f.period + f.r[0] * 4) % 3 === 0) ? -s : 0;
        this._blit(ctx, f.calm, f.x, f.y, false, dy, s);
      }
    }
  }

  root.Crowd = Crowd;
  if (typeof module !== 'undefined' && module.exports) module.exports = Crowd;
})(typeof window !== 'undefined' ? window : globalThis);
