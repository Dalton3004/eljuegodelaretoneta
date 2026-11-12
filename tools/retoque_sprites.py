#!/usr/bin/env python3
"""
Liga Chaquito F8 - Retoque de sprites (post-proceso del atlas ya armado).

Corre DESPUÉS de tools/build_sprites.py (o directamente sobre el atlas instalado) y aplica retoques
puntuales de legibilidad a escala de juego (0.48, sin suavizado). No cambia IDs de kits, no cambia
nombres ni coordenadas de los cuadros existentes: solo repinta píxeles dentro de los rectángulos de
siempre y AGREGA cuadros nuevos en zonas vacías del atlas.

Retoques (todos los kits de jugador, los 16 kits):
  1. P_step_a / U_step_a: el pie de apoyo quedaba 5 px en el aire (el jugador "flotaba" en ese paso).
     Se rehacen espejando las piernas de P_step_b / U_step_b -> paso izquierdo y derecho simétricos.
  2. Espalda (U_*): la nuca era una mancha de ruido del color del pelo. Se repinta con 3 tonos del
     propio pelo de cada equipo (luz arriba-izquierda, mechones verticales), sombra en la nuca y cuello.
  3. Rayitas finas (kit "local"): con 1-2 px desaparecían/parpadeaban al dibujar a 0.48 sin suavizado.
     Se ensanchan a 3 px (sobreviven al muestreo).
  4. Cuadros nuevos (en la fila 2 del grupo player, x >= 243, espacio que estaba vacío):
       S_pass    paso "de cruce" de costado (piernas juntas bajo la cadera) -> carrera con zancada real
       S_windup  carga del tiro de costado (pierna de atrás levantada) -> anticipación del remate
  5. Arquero: GK_dive_low_3, GK_catch_2 y GK_lying miraban al lado contrario que el resto de la
     estirada (el arquero se "daba vuelta" en el último cuadro). Se espejan para que todos miren igual.
     Si en tu game.js el arquero queda mirando al revés, corré con --gk-orientacion derecha.
  6. anims: carrera lateral con S_pass, arquero que se desplaza agachado (GK_ready) en vez de
     alternar parado/agachado, y anims nuevas (kick_windup, slide_rise, gk_land) que usa fx.js.

Uso (desde la carpeta del proyecto):
  python3 tools/retoque_sprites.py                 # retoca assets/sprites/atlas.png + atlas.js
  python3 tools/retoque_sprites.py --forzar        # vuelve a aplicar partiendo del respaldo
  python3 tools/retoque_sprites.py --gk-orientacion derecha
  python3 tools/retoque_sprites.py --sin-espalda --sin-rayas   # desactivar retoques puntuales

Se guarda un respaldo assets/sprites/atlas_sin_retoque.png/.js la primera vez.
Requisitos: Python 3 + pillow + numpy (sin scipy).
"""
import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SPR = ROOT / "assets" / "sprites"
VERSION = 1

PLAYER_FRAMES_NEW_ROW_Y = 125   # fila 2 del grupo player (donde están U_*); a la derecha está vacío
NEW_FRAMES_X0 = 243
GK_FACING_RIGHT = ["GK_dive_low_3", "GK_catch_2", "GK_lying"]
GK_FACING_LEFT = ["GK_dive_up_1", "GK_dive_up_2", "GK_dive_mid_1", "GK_dive_mid_2",
                  "GK_catch_1", "GK_dive_low_1", "GK_dive_low_2"]


# ============================================================================
# atlas.js
# ============================================================================
def load_atlas_js(path):
    src = path.read_text(encoding="utf-8")
    return json.loads(src[src.index("{"):src.rindex("}") + 1])


def save_atlas_js(path, data):
    path.write_text(
        "// GENERADO por tools/build_sprites.py + tools/retoque_sprites.py - no editar a mano\n"
        "const SPRITE_ATLAS = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")


class Atlas:
    def __init__(self, data, img):
        self.d = data
        self.a = np.array(img.convert("RGBA"))

    def rect(self, kit, name):
        k = self.d["kits"][kit]
        f = self.d["groups"][k["group"]]["frames"][name]
        return k["y"] + f["y"], f["x"], f["h"], f["w"], f

    def get(self, kit, name):
        y, x, h, w, _ = self.rect(kit, name)
        return self.a[y:y + h, x:x + w].copy()

    def put(self, kit, name, img):
        y, x, h, w, _ = self.rect(kit, name)
        assert img.shape[:2] == (h, w), (kit, name, img.shape, (h, w))
        self.a[y:y + h, x:x + w] = img

    def kits(self, group):
        return [k for k, v in self.d["kits"].items() if v["group"] == group]

    def free(self, group, x, y, w, h):
        """True si el rectángulo (relativo a la fila del kit) no pisa ningún cuadro ni sale del atlas."""
        H, W = self.a.shape[:2]
        if x + w > W:
            return False
        for f in self.d["groups"][group]["frames"].values():
            if not (x + w <= f["x"] or f["x"] + f["w"] <= x or y + h <= f["y"] or f["y"] + f["h"] <= y):
                return False
        for k in self.kits(group):
            ky = self.d["kits"][k]["y"]
            # que no se meta en la franja del kit siguiente
            nxt = min([v["y"] for v in self.d["kits"].values() if v["y"] > ky] + [H])
            if ky + y + h > nxt:
                return False
            if self.a[ky + y:ky + y + h, x:x + w, 3].any():
                return False
        return True

    def image(self):
        return Image.fromarray(self.a, "RGBA")


# ============================================================================
# utilidades de píxeles (numpy puro)
# ============================================================================
def first_diff_row(a, b):
    d = np.abs(a.astype(int) - b.astype(int)).sum(2).sum(1)
    nz = np.where(d > 0)[0]
    return int(nz[0]) if len(nz) else None


def mirror_rows(img, y0, px):
    """Espeja horizontalmente las filas >= y0 alrededor del pivote px (piernas)."""
    h, w = img.shape[:2]
    out = img.copy()
    out[y0:] = 0
    for xd in range(w):
        xs = 2 * px - 1 - xd
        if 0 <= xs < w:
            out[y0:, xd] = img[y0:, xs]
    return out


def squeeze_legs(img, y0, kmin=0.55):
    """Junta las piernas bajo la cadera (más cerca de los pies = más junto): pose de cruce."""
    h, w = img.shape[:2]
    a = img[..., 3] > 128
    out = img.copy()
    out[y0:] = 0
    xs = np.where(a[y0:y0 + 4].any(0))[0]
    hx = (xs.min() + xs.max()) / 2
    ybot = np.where(a.any(1))[0][-1]
    for y in range(y0, h):
        t = min(1.0, max(0.0, (y - y0) / max(1, ybot - y0) * 1.4))
        t = t * t * (3 - 2 * t)
        k = 1 - (1 - kmin) * t
        for xd in range(w):
            xsrc = int(round(hx + (xd - hx) / k))
            if 0 <= xsrc < w:
                out[y, xd] = img[y, xsrc]
    return out


def windup_legs(img, y0, scale=0.72, shift=-6):
    """Levanta y tira hacia atrás la pierna de atrás (debajo del short: el short no se parte)."""
    h, w = img.shape[:2]
    # buscar la fila donde las dos piernas se separan (entrepierna)
    a = img[..., 3] > 128
    ys0, cx = y0 + 13, 48
    for y in range(max(y0, 86), h - 6):
        xs = np.where(a[y])[0]
        gaps = [xs[i] for i in range(len(xs) - 1) if xs[i + 1] - xs[i] > 1 and xs[i] > 30]
        if gaps:
            ys0, cx = y, gaps[0] + 1
            break
    out = img.copy()
    leg = img[ys0:, :cx].copy()
    out[ys0:, :cx] = 0
    nh = max(1, int(round(leg.shape[0] * scale)))
    src_rows = (np.arange(nh) / scale).astype(int).clip(0, leg.shape[0] - 1)
    sq = leg[src_rows]
    for i in range(nh):
        s = int(round(shift * i / max(1, nh - 1)))
        for x in range(cx):
            xs = x - s
            if 0 <= xs < cx and sq[i, xs, 3] > 0:
                out[ys0 + i, x] = sq[i, xs]
    return out


def lum(rgb):
    rgb = rgb.astype(float)
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def dilate(mask, it=1):
    m = mask.copy()
    for _ in range(it):
        n = m.copy()
        n[1:] |= m[:-1]; n[:-1] |= m[1:]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]
        m = n
    return m


# ============================================================================
# retoque 2: nuca / pelo de espaldas
# ============================================================================
def clean_back_head(front, back):
    """front = cuadro de frente (P_*), back = el mismo cuadro de espaldas (U_*). Devuelve back retocado."""
    fa, ba = front[..., 3] > 200, back[..., 3] > 200
    diff = (np.abs(front[..., :3].astype(int) - back[..., :3].astype(int)).sum(2) > 0) & fa & ba
    if diff.sum() < 30:
        return back
    ys, xs = np.where(diff)
    y_top, y_chin = ys.min(), ys.max()
    head = np.zeros_like(fa)
    head[:y_chin] = True                                      # nunca baja al cuello de la camiseta
    opaque = back[..., 3] > 200
    edge = dilate(~opaque, 2) & opaque                        # contorno exterior: no se toca

    hair_med = np.median(back[diff][:, :3], axis=0)
    dist = np.abs(back[..., :3].astype(float) - hair_med).sum(2)
    # restos de cara/oreja al costado del óvalo (en la mitad superior de la cara)
    ear_zone = np.zeros_like(fa)
    ear_zone[:y_chin - 3] = True
    skin_f = front[..., :3].astype(float)
    mx, mn = skin_f.max(2), skin_f.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    skinlike = (mx > 135) & (sat > 0.22) & (skin_f[..., 0] > skin_f[..., 2] + 28)
    near = dilate(diff, 4) & ear_zone & opaque & ~edge & skinlike
    R = (diff | near) & ~edge
    H0 = head & opaque & ~edge & ~R & (dist < 110)

    ref = back[H0][:, :3] if H0.sum() > 40 else back[R][:, :3]
    L = lum(ref)
    order = np.argsort(L)
    n = len(order)
    shadow = np.median(ref[order[: max(1, n * 3 // 10)]], axis=0)
    base = np.median(ref[order[n * 3 // 10: max(n * 3 // 10 + 1, n * 8 // 10)]], axis=0)
    high = np.median(ref[order[n * 8 // 10:]], axis=0)
    if lum(high[None])[0] - lum(base[None])[0] < 18:
        high = np.clip(base + 22, 0, 255)
    if lum(base[None])[0] - lum(shadow[None])[0] < 14:
        shadow = np.clip(base * 0.72, 0, 255)
    hair_line = np.clip(shadow * 0.55, 0, 255)

    skin = np.median(front[diff][:, :3], axis=0)
    neck = np.clip(skin * 0.80, 0, 255)

    allh = R | H0
    hy, hx = np.where(allh)
    cy, cx = (hy.min() + hy.max()) / 2, (hx.min() + hx.max()) / 2
    ry, rx = max(1, (hy.max() - hy.min()) / 2), max(1, (hx.max() - hx.min()) / 2)
    out = back.copy()
    ry_, rx_ = np.where(R)
    rbot = ry_.max()
    for y, x in zip(ry_, rx_):
        u, v = (x - cx) / rx, (y - cy) / ry
        shade = 0.55 - 0.28 * u - 0.45 * v
        shade += 0.10 * np.sign(np.sin(x * 0.9 + y * 0.12))
        if y >= rbot - 3:
            shade -= 0.35
        col = shadow if shade < 0.38 else (base if shade < 0.74 else high)
        out[y, x, :3] = col
    # cuello: 2 filas de piel en sombra + 1 fila oscura arriba (solo dentro del óvalo original diff)
    dy_, dx_ = np.where(diff & ~edge)
    rows = sorted(set(dy_))
    for idx, y in enumerate(rows[-3:]):
        xs_row = dx_[dy_ == y]
        if len(xs_row) < 4:
            continue
        mid = (xs_row.min() + xs_row.max()) / 2
        half = max(3, (xs_row.max() - xs_row.min()) * 0.28)
        for x in xs_row:
            if abs(x - mid) <= half:
                out[y, x, :3] = hair_line if idx == 0 else neck
    return out


# ============================================================================
# retoque 3: rayitas finas
# ============================================================================
def widen_thin_stripes(img, min_w=3, y_range=None):
    """Ensancha rayas claras verticales de 1-2 px (dentro de la camiseta) hasta min_w px."""
    out = img.copy()
    rgb = img[..., :3].astype(float)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    light = (mx > 185) & (sat < 0.30) & (img[..., 3] > 200)
    colored = (sat > 0.35) & (img[..., 3] > 200) & (rgb[..., 2] > rgb[..., 0] + 40)   # azul de la camiseta
    h, w = light.shape
    y0, y1 = y_range if y_range else (0, h)
    for y in range(y0, min(y1, h)):
        x = 0
        while x < w:
            if light[y, x]:
                s = x
                while x < w and light[y, x]:
                    x += 1
                run = x - s
                if run < min_w and s > 0 and x < w and colored[y, s - 1] and colored[y, x]:
                    need = min_w - run
                    col = img[y, s:x, :3].mean(0)
                    for k in range(need):
                        xx = x + k
                        if xx < w and colored[y, xx]:
                            out[y, xx, :3] = col
                x += max(0, min_w - run)
            else:
                x += 1
    return out


# ============================================================================
# principal
# ============================================================================
def main():
    ap = argparse.ArgumentParser(description="Retoques de legibilidad sobre el atlas")
    ap.add_argument("--atlas", default=str(SPR / "atlas.png"))
    ap.add_argument("--forzar", action="store_true", help="re-aplicar partiendo del respaldo sin retoque")
    ap.add_argument("--gk-orientacion", choices=["izquierda", "derecha"], default="izquierda",
                    help="hacia dónde miran TODOS los cuadros de estirada (default: izquierda, como la mayoría)")
    ap.add_argument("--sin-espalda", action="store_true")
    ap.add_argument("--sin-rayas", action="store_true")
    ap.add_argument("--sin-pasos", action="store_true")
    ap.add_argument("--sin-arquero", action="store_true")
    ap.add_argument("--kits-rayas", default="local", help="kits con rayitas finas a ensanchar (coma)")
    a = ap.parse_args()

    png = Path(a.atlas)
    js = png.with_suffix(".js")
    bak_png = png.with_name(png.stem + "_sin_retoque.png")
    bak_js = png.with_name(png.stem + "_sin_retoque.js")

    data = load_atlas_js(js)
    if data.get("retoque"):
        if not a.forzar:
            print(f"El atlas ya tiene el retoque v{data['retoque'].get('version')}. Usá --forzar para re-aplicarlo.")
            return
        if not bak_png.exists():
            raise SystemExit("No hay respaldo sin retoque para re-aplicar (atlas_sin_retoque.png).")
        shutil.copyfile(bak_png, png)
        shutil.copyfile(bak_js, js)
        data = load_atlas_js(js)
    else:
        shutil.copyfile(png, bak_png)
        shutil.copyfile(js, bak_js)

    A = Atlas(data, Image.open(png))
    PF = data["groups"]["player"]["frames"]
    players = A.kits("player")
    log = []

    # ---- 1. pasos de frente/espalda simétricos ----
    if not a.sin_pasos:
        for kit in players:
            for idle, b, tgt in (("P_idle", "P_step_b", "P_step_a"), ("U_idle", "U_step_b", "U_step_a")):
                ib, bb = A.get(kit, idle), A.get(kit, b)
                y0 = first_diff_row(ib, bb)
                if y0 is None:
                    continue
                A.put(kit, tgt, mirror_rows(bb, y0, PF[tgt]["px"]))
        log.append("P_step_a/U_step_a: piernas espejadas de *_step_b (pie de apoyo en el piso)")

    # ---- 2. nuca ----
    if not a.sin_espalda:
        for kit in players:
            for f, u in (("P_idle", "U_idle"), ("P_step_a", "U_step_a"), ("P_step_b", "U_step_b")):
                A.put(kit, u, clean_back_head(A.get(kit, f), A.get(kit, u)))
        log.append("U_*: nuca repintada con 3 tonos + cuello")

    # ---- 3. rayitas ----
    if not a.sin_rayas:
        for kit in [k.strip() for k in a.kits_rayas.split(",") if k.strip() in data["kits"]]:
            for name in ("P_idle", "P_step_a", "P_step_b", "U_idle", "U_step_a", "U_step_b",
                         "S_a", "S_step_a", "S_step_b", "S_kick"):
                A.put(kit, name, widen_thin_stripes(A.get(kit, name)))
        log.append(f"rayas finas ensanchadas a 3 px en: {a.kits_rayas}")

    # ---- 4. cuadros nuevos ----
    sa_ref, sb_ref = A.get("local", "S_a"), A.get("local", "S_step_b")
    y_side = first_diff_row(sa_ref, sb_ref) or 79
    new = {}
    x = NEW_FRAMES_X0
    for name, src in (("S_pass", "S_a"), ("S_windup", "S_a")):
        f = PF[src]
        w, h = f["w"], f["h"]
        if name in PF:                      # ya existía (re-aplicado): mismo lugar
            new[name] = PF[name]
            continue
        while not A.free("player", x, PLAYER_FRAMES_NEW_ROW_Y, w, h):
            x += 2
            if x + w > A.a.shape[1]:
                raise SystemExit(f"No hay lugar libre para {name} en el atlas")
        new[name] = {"x": x, "y": PLAYER_FRAMES_NEW_ROW_Y, "w": w, "h": h, "px": f["px"], "py": f["py"]}
        PF[name] = new[name]
        x += w + 2
    for kit in players:
        sa = A.get(kit, "S_a")
        A.put(kit, "S_pass", squeeze_legs(sa, y_side, 0.55))
        A.put(kit, "S_windup", windup_legs(sa, y_side, 0.72, -6))
    log.append("cuadros nuevos: " + ", ".join(f"{k}@({v['x']},{v['y']})" for k, v in new.items()))

    # ---- 5. arquero: todas las estiradas para el mismo lado ----
    GF = data["groups"]["gk"]["frames"]
    if not a.sin_arquero:
        flip = GK_FACING_RIGHT if a.gk_orientacion == "izquierda" else GK_FACING_LEFT
        for kit in A.kits("gk"):
            for name in flip:
                A.put(kit, name, A.get(kit, name)[:, ::-1].copy())
        for name in flip:
            GF[name]["px"] = GF[name]["w"] - GF[name]["px"]
        log.append(f"arquero: espejados {', '.join(flip)} (todos miran a la {a.gk_orientacion})")

    # ---- 6. anims ----
    an = data["anims"]
    an["player"]["side_run"] = ["S_step_a", "S_pass", "S_step_b", "S_pass"]
    an["player"]["kick_windup"] = ["S_windup"]
    an["player"]["slide"] = ["SL_1", "SL_2", "SL_2", "SL_3"]
    an["player"]["slide_rise"] = ["SL_end", "SL_1"]
    for k in ("down_run", "up_run", "side_run"):
        an["gk"][k] = ["GK_ready"]
    an["gk"]["gk_set"] = ["GK_ready"]
    an["gk"]["gk_land"] = ["GK_dive_low_3", "GK_ready"]

    data["retoque"] = {"version": VERSION, "gk_orientacion": a.gk_orientacion, "cambios": log}
    A.image().save(png, optimize=True)
    save_atlas_js(js, data)
    print("OK retoque aplicado:")
    for l in log:
        print("  -", l)
    print(f"  respaldo: {bak_png.name} / {bak_js.name}")


if __name__ == "__main__":
    main()
