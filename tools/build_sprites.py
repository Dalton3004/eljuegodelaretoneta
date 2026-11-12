#!/usr/bin/env python3
"""
Liga Chaquito F8 - Constructor de sprites (v2, alta resolución).

Fuente:
  assets/SPRAYS DE DEFENSAS Y MOVIMIENTOS DE ARQUEROS.png   hoja con barrida y arquero (arte nítido)

Genera:
  assets/sprites/atlas.png   atlas en ALTA resolución (se dibuja a escala 0.56 -> bordes suaves)
  assets/sprites/atlas.js    const SPRITE_ATLAS = {...} (rectángulos, pivotes y animaciones)
  tools/preview_atlas.png    hoja de contacto para revisar

Qué corrige respecto a los originales:
  * vista de espaldas generada a partir de la de frente (mismo estilo en todas las direcciones)
  * recorta la hoja de arte nítido por Python (fondo liso -> máscara) y le saca el tinte azul del borde
  * genera pasos de piernas (las de frente) para que corra de verdad
  * 4 equipaciones base: azul, rojo (cambio de tono), arquero rosa y arquero violeta
  * 12 equipaciones de equipo ("team_<id>") con los colores de tools/equipos.json
    (camiseta a rayas, mangas, short y medias) + assets/equipos.js con los datos de cada equipo

Uso:  python3 tools/build_sprites.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SPR = ROOT / "assets" / "sprites"
SHEET = ROOT / "assets" / "SPRAYS DE DEFENSAS Y MOVIMIENTOS DE ARQUEROS.png"

PLAYER_H = 112        # alto del cuerpo en el atlas (px). En pantalla = PLAYER_H * DRAW_SCALE
GK_H = 118
DRAW_SCALE = 0.48     # 112 * 0.48 = 54 px en cancha (el valor que usa el juego hoy)
PAD = 2
EQUIPOS_JSON = ROOT / "tools" / "equipos.json"
EQUIPOS_JS = ROOT / "assets" / "equipos.js"


# ============================================================================
# utilidades de imagen
# ============================================================================
def resize_premult(im, size):
    """Redimensiona sin que el color del fondo transparente 'sangre' en los bordes."""
    return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def scale_to_height(im, h):
    return resize_premult(im, (max(1, round(im.width * h / im.height)), h))


def recolor(im, hue_deg, sat_mult=1.0, val_mult=1.0, src_range=(175, 265)):
    """Cambia el tono SOLO de los píxeles saturados dentro de src_range (la camiseta).
    Pelo, piel, negro y blanco quedan intactos."""
    if hue_deg is None:
        return im.copy()
    rgba = np.array(im)
    hsv = np.array(Image.fromarray(rgba[..., :3]).convert("HSV")).astype(float)
    h = hsv[..., 0] * 360 / 255
    s = hsv[..., 1] / 255
    v = hsv[..., 2] / 255
    sel = (h > src_range[0]) & (h < src_range[1]) & (s > 0.18) & (v > 0.18) & (rgba[..., 3] > 0)
    hsv[..., 0][sel] = (hue_deg % 360) * 255 / 360
    hsv[..., 1][sel] = np.clip(hsv[..., 1][sel] * sat_mult, 0, 255)
    hsv[..., 2][sel] = np.clip(hsv[..., 2][sel] * val_mult, 0, 255)
    rgb = np.array(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    rgba[..., :3] = rgb
    return Image.fromarray(rgba, "RGBA")


def make_back(front):
    """Vista de espaldas a partir de la de frente: se cubre la cara con el color del pelo."""
    a = np.array(front)
    h, w = a.shape[:2]
    rgb = a[..., :3].astype(float) / 255
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    hue = np.zeros_like(mx)
    d = np.maximum(mx - mn, 1e-6)
    r, g, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.where(mx == r, ((g - b_) / d) % 6, np.where(mx == g, (b_ - r) / d + 2, (r - g) / d + 4)) * 60
    opaque = a[..., 3] > 200
    head = np.zeros_like(opaque); head[: int(h * 0.44)] = True
    skin = opaque & head & (hue > 8) & (hue < 38) & (sat > 0.22) & (mx > 0.55)
    hair = opaque & head & (hue > 5) & (hue < 40) & (mx < 0.42) & (sat > 0.2)
    ys, xs = np.where(skin)
    if len(ys) == 0 or not hair.any():
        return front
    hair_col = np.median(a[hair][:, :3], axis=0)
    cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
    ry, rx = (ys.max() - ys.min()) / 2 + 2.5, (xs.max() - xs.min()) / 2 + 1.5
    yy, xx = np.mgrid[0:h, 0:w]
    face = opaque & (((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2 <= 1.0)
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 5, size=(h, w, 1))
    a[face, :3] = np.clip(hair_col + noise[face], 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


# ============================================================================
# equipaciones de los equipos (camiseta a rayas + short + medias)
# ============================================================================
def _hex(c):
    return np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)], float)


def _hsv(rgb):
    hsv = np.array(Image.fromarray(rgb).convert("HSV")).astype(float)
    return hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255


UPRIGHT = {"P_idle", "P_step_a", "P_step_b", "U_idle", "U_step_a", "U_step_b",
           "S_a", "S_step_a", "S_step_b", "S_kick"}   # cuadros de pie: se separan camiseta / short / medias por altura


def _classify(im, torso_limit=None, shorts_limit=None):
    """Una pasada de clasificación de píxeles de un cuadro del jugador original (camiseta azul/negra)."""
    a = np.array(im)
    alpha = a[..., 3]
    h, s, v = _hsv(a[..., :3])
    solid = alpha > 200
    H, W = alpha.shape
    yy, xx = np.mgrid[0:H, 0:W]
    blue = solid & (h > 175) & (h < 265) & (s > 0.18) & (v > 0.18)

    # La camiseta es el conjunto de rayas azules más grande; las medias son lo que queda aparte.
    lab, n = ndi.label(ndi.binary_dilation(blue, iterations=3))
    if n == 0:
        return None
    areas = np.array(ndi.sum(blue, lab, range(1, n + 1)))
    shirt_ids = [i + 1 for i, ar in enumerate(areas) if ar >= 0.3 * areas.max()]
    shirt_blue = blue & np.isin(lab, shirt_ids)
    sock_ids = [i + 1 for i, ar in enumerate(areas) if (i + 1) not in shirt_ids and ar >= 24]
    sock_blue = blue & np.isin(lab, sock_ids)
    stray = blue & ~shirt_blue & ~sock_blue
    if torso_limit is not None:           # cuadros de pie: lo azul por debajo del short son medias
        low = shirt_blue & (yy > torso_limit)
        sock_blue = sock_blue | low
        shirt_blue = shirt_blue & ~low

    region = ndi.binary_closing(ndi.binary_dilation(shirt_blue, iterations=3), iterations=2) & solid
    skin = solid & (h > 5) & (h < 40) & (s > 0.2) & (v > 0.5)
    hair = solid & (h > 5) & (h < 40) & (s > 0.2) & (v <= 0.5)
    dark = solid & (v < 0.30) & ~skin & ~hair & ~blue
    transparent = alpha < 128
    protect = ndi.binary_dilation(transparent, iterations=1) | ndi.binary_dilation(skin | hair, iterations=1)

    stripe2 = dark & region & ~protect
    dist = ndi.distance_transform_edt(~region)
    shorts = dark & ~region & ~protect & (dist <= 21)
    if shorts_limit is not None:          # el short no se come los zapatos
        shorts = shorts & (yy <= shorts_limit)
    number = region & solid & (v > 0.6) & (s < 0.22) & ~skin
    return {"a": a, "v": v, "shirt": shirt_blue, "sock": sock_blue, "stripe2": stripe2,
            "shorts": shorts, "number": number, "stray": stray}


def analyze_kit(im, name=""):
    """Clasifica los píxeles de un cuadro: rayas azules, rayas negras, mangas, short, medias y número.
    Los contornos, la piel, el pelo y los zapatos no se tocan. Además separa torso y mangas por fila."""
    m = _classify(im)
    if m is None:
        return None
    if name in UPRIGHT:
        # fila donde termina el short (cuerpo principal): de ahí para abajo, lo azul son medias
        rows = m["shorts"].sum(1)
        ys = np.where(rows >= 6)[0]
        ys = ys[ys > im.height * 0.45]
        if len(ys):
            bottom = int(ys.max())
            m = _classify(im, torso_limit=bottom - 2, shorts_limit=bottom + 1)
    H, W = m["shirt"].shape
    yy, xx = np.mgrid[0:H, 0:W]
    # torso = rayas azules + rayas oscuras que quedan dentro del ancho de las azules en esa fila
    torso_dark = np.zeros_like(m["stripe2"])
    for y in range(H):
        xs = np.where(m["shirt"][y])[0]
        if len(xs) >= 3:
            lo, hi = xs.min() - 2, xs.max() + 2
            torso_dark[y, max(lo, 0):hi + 1] = True
    torso_dark &= m["stripe2"]
    m["torso_dark"] = torso_dark
    m["sleeves"] = m["stripe2"] & ~torso_dark
    torso = m["shirt"] | torso_dark
    ys, xs = np.where(m["shirt"])
    m["box"] = (xs.min(), xs.max(), ys.min(), ys.max()) if len(ys) else (0, W - 1, 0, H - 1)
    m["torso"] = torso
    # banda de los puños de las medias (primeras filas de cada media)
    sock = m["sock"]
    top = np.zeros_like(sock)
    if sock.any():
        lab, n = ndi.label(sock)
        for i in range(1, n + 1):
            comp = lab == i
            yi = np.where(comp)[0] if False else np.where(comp.any(1))[0]
            if len(yi) >= 6:
                top |= comp & (yy <= yi.min() + 2)
    m["sock_top"] = top
    return m


def _shade(color, ratio):
    """Pinta 'color' respetando el sombreado del original (ratio ~1 = tono medio).
    ratio: vector (N,) -> devuelve (N, 3). Los colores casi negros se levantan un poco
    para que se vean los pliegues en vez de quedar una mancha plana."""
    r = ratio[:, None]
    if color.max() < 40:
        color = np.array([26.0, 26.0, 30.0])
    return np.where(r <= 1.0, color * np.minimum(r, 1.0),
                    color + (255 - color) * np.clip(r - 1.0, 0, 1) * 0.6)


def _lum(c):
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


def _design_mask(design, m):
    """True donde va el color B (franja2) del torso; False = color A (franja)."""
    x0, x1, y0, y1 = m["box"]
    H, W = m["shirt"].shape
    yy, xx = np.mgrid[0:H, 0:W]
    u = (xx - x0) / max(1, x1 - x0)
    w = (yy - y0) / max(1, y1 - y0)
    if design == "mitades":
        return u >= 0.5
    if design == "aros":
        return ((yy - y0) // 4) % 2 == 1
    if design == "banda":
        return np.abs(u - w) < 0.20
    if design == "franja_central":
        return np.abs(u - 0.5) < 0.15
    return np.zeros((H, W), bool)          # "lisa"


def paint_kit(m, kit):
    """Aplica 'kit' a un cuadro analizado. Campos del kit:
    diseno: rayas | lisa | mitades | aros | banda | franja_central
    franja (color A), franja2 (color B), mangas, short, medias, medias2 (puños), numero ('#hex' o 'auto')."""
    a = m["a"].copy()
    v = m["v"]
    out = a[..., :3].astype(float)
    design = kit.get("diseno", "rayas")
    A, B = _hex(kit["franja"]), _hex(kit["franja2"])

    def soft_ratio(mask, vref):
        r = np.clip(v[mask] / max(vref, 1e-3), 0.5, 1.5)
        return np.clip(1 + 0.6 * (r - 1), 0.8, 1.15)

    def paint(mask, color, vref=None):
        if not mask.any():
            return
        c = _hex(color) if isinstance(color, str) else color
        vmed = vref if vref else (np.median(v[mask]) or 1.0)
        out[mask] = _shade(c, soft_ratio(mask, vmed))

    if m["stray"].any():
        out[m["stray"]] = (v[m["stray"]] * 150)[:, None]

    torso = m["torso"]
    blue_med = np.median(v[m["shirt"]]) if m["shirt"].any() else 1.0
    dark_med = np.median(v[m["torso_dark"]]) if m["torso_dark"].any() else 1.0
    pixel_color = np.zeros(a.shape[:2] + (3,))
    if design == "rayas":
        # camiseta clásica: rayas azules -> A, rayas oscuras -> B (el negro conserva sus pliegues)
        paint(m["shirt"], A, blue_med)
        if B.max() >= 60:
            paint(m["torso_dark"], B, dark_med)
        pixel_color[m["shirt"]] = A
        pixel_color[m["torso_dark"]] = B
    else:
        bmask = _design_mask(design, m)
        refv = np.where(m["shirt"], blue_med, dark_med)
        for sel, color in ((torso & ~bmask, A), (torso & bmask, B)):
            if sel.any():
                r = np.clip(v[sel] / refv[sel], 0.5, 1.5)
                out[sel] = _shade(color, np.clip(1 + 0.5 * (r - 1), 0.82, 1.12))
                pixel_color[sel] = color

    # mangas
    sl_color = kit.get("mangas", kit["franja2"])
    sc = _hex(sl_color)
    if m["sleeves"].any() and not (design == "rayas" and sc.max() < 60):
        paint(m["sleeves"], sl_color, dark_med)
    pixel_color[m["sleeves"]] = sc

    # medias (con puño opcional) y short
    med = _hex(kit["medias"])
    paint(m["sock"], med)
    if kit.get("medias2") and m["sock_top"].any():
        paint(m["sock_top"], kit["medias2"])
    sh = _hex(kit["short"])
    if sh.max() >= 60 or design != "rayas":
        paint(m["shorts"], kit["short"])

    # número: contraste automático contra el color de cada píxel (o color fijo)
    num = kit.get("numero", "auto")
    nm = m["number"]
    if nm.any():
        if num == "auto":
            base = pixel_color[nm]
            base[(base == 0).all(1)] = A
            out[nm] = np.where(_lum(base)[:, None] > 150, 20.0, 245.0)
        else:
            out[nm] = _hex(num)
    a[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


# ============================================================================
# hoja de arte nítido (barrida + arquero)
# ============================================================================
def load_sheet():
    """Devuelve los 31 sprites de la hoja, ordenados por fila y luego por columna."""
    im = Image.open(SHEET).convert("RGB")
    a = np.array(im).astype(float)
    bg = np.median(a[:40, :40].reshape(-1, 3), axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(2))
    fg = ndi.binary_opening(d > 22, iterations=1)

    lab, n = ndi.label(ndi.binary_dilation(fg, iterations=4))
    lab = lab * fg
    areas = ndi.sum(fg, lab, range(1, n + 1))
    bodies = [i + 1 for i, ar in enumerate(areas) if ar > 4000]
    body_mask = np.isin(lab, bodies)
    dist, (iy, ix) = ndi.distance_transform_edt(~body_mask, return_indices=True)
    final = np.where(fg & (dist < 70), lab[iy, ix], 0)         # el polvo se pega a su cuerpo
    final = np.where(np.isin(final, bodies), final, 0)
    objs = ndi.find_objects(final)

    items = [(i, objs[i - 1]) for i in bodies if objs[i - 1] is not None]
    items.sort(key=lambda t: (round((t[1][0].start + t[1][0].stop) / 2 / 165), t[1][1].start))

    sprites = []
    for i, _ in items:
        region = ndi.binary_dilation(final == i, iterations=3)
        alpha = np.clip((d - 14) / (34 - 14), 0, 1) * region
        # quitar el tinte del fondo en los bordes semitransparentes
        col = np.clip((a - (1 - alpha[..., None]) * bg) / np.maximum(alpha, 1e-3)[..., None], 0, 255)
        sp = Image.fromarray(np.dstack([col, alpha * 255]).astype(np.uint8), "RGBA")
        sprites.append(sp.crop(sp.getbbox()))
    return sprites


def leg_step(im, left_scale, right_scale, y0_frac=0.70):
    """Paso de piernas: acorta una pierna (pie arriba) y deja la otra. Sin huecos."""
    w, h = im.size
    y0 = int(h * y0_frac)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im.crop((0, 0, w, y0)), (0, 0))
    legs = im.crop((0, y0, w, h))
    cx = w // 2
    for x0, x1, sc in ((0, cx, left_scale), (cx, w, right_scale)):
        part = legs.crop((x0, 0, x1, legs.height))
        part = resize_premult(part, (part.width, max(1, round(part.height * sc))))
        out.paste(part, (x0, y0), part)
    return out


# ============================================================================
# armado
# ============================================================================
KITS = {  # nombre: (grupo, tono destino, sat, brillo, rango de tono origen)
    "local":    ("player", None, 1.0, 1.0, (175, 265)),
    "rival":    ("player", 356, 1.35, 1.30, (175, 265)),
    "gk_local": ("gk",     None, 1.0, 1.0, (290, 355)),
    "gk_rival": ("gk",     270, 1.0, 1.0, (290, 355)),
}


def pack(frames, width=1100):
    x = y = rowh = 0
    rects = {}
    for name, im in frames.items():
        w, h = im.size
        if x + w + PAD > width:
            x, y, rowh = 0, y + rowh + PAD, 0
        rects[name] = {"x": x, "y": y, "w": w, "h": h}
        x += w + PAD
        rowh = max(rowh, h)
    return rects, y + rowh + PAD


def main():
    sheet = load_sheet()
    assert len(sheet) == 31, f"se esperaban 31 sprites en la hoja, hay {len(sheet)}"
    sp = PLAYER_H / sheet[0].height
    sg = GK_H / sheet[13].height
    def sc(i, s): return resize_premult(sheet[i], (round(sheet[i].width * s), round(sheet[i].height * s)))

    # ---- grupo "player" ----
    P = {}
    P["P_idle"] = sc(0, sp)                       # de frente, parado
    P["P_step_a"] = leg_step(P["P_idle"], 0.84, 1.0)
    P["P_step_b"] = leg_step(P["P_idle"], 1.0, 0.84)
    P["S_a"] = sc(1, sp)                          # de costado (mira a la derecha)
    P["S_step_a"] = leg_step(P["S_a"], 0.86, 1.0)
    P["S_step_b"] = leg_step(P["S_a"], 1.0, 0.86)
    P["S_kick"] = sc(2, sp)                       # patada
    for k, i in (("SL_1", 3), ("SL_2", 4), ("SL_3", 5), ("SL_end", 6)):
        P[k] = sc(i, sp)                          # barrida
    P["U_idle"] = make_back(P["P_idle"])          # de espaldas (generado)
    P["U_step_a"] = leg_step(P["U_idle"], 0.84, 1.0)
    P["U_step_b"] = leg_step(P["U_idle"], 1.0, 0.84)

    # ---- grupo "gk" ----
    G = {"GK_stand": sc(13, sg), "GK_ready": sc(19, sg)}
    for k, i in (("GK_dive_up_1", 14), ("GK_dive_up_2", 15), ("GK_dive_mid_1", 16), ("GK_dive_mid_2", 17),
                 ("GK_catch_1", 18), ("GK_dive_low_1", 20), ("GK_dive_low_2", 21), ("GK_dive_low_3", 22),
                 ("GK_catch_2", 23), ("GK_lying", 24)):
        G[k] = sc(i, sg)

    groups = {"player": P, "gk": G}
    layout = {}
    strip_h = {}
    for g, frames in groups.items():
        layout[g], strip_h[g] = pack(frames)
        for name, r in layout[g].items():
            # pivote: pies, al centro. En la barrida se corre hacia atrás: el cuerpo avanza.
            r["px"] = round(r["w"] * (0.40 if name.startswith("SL_") else 0.5))
            r["py"] = r["h"] - (0 if name.startswith(("SL_", "GK_dive", "GK_catch", "GK_lying")) else 0)

    # ---- equipos (tools/equipos.json) ----
    equipos = json.loads(EQUIPOS_JSON.read_text(encoding="utf-8"))["equipos"]
    analyzed = {name: analyze_kit(im, name) for name, im in P.items()}
    team_kits = {f"team_{e['id']}": e["kit"] for e in equipos}

    # ---- atlas ----
    W = 1100
    kit_y, y = {}, 0
    for k, (g, *_rest) in KITS.items():
        kit_y[k] = y
        y += strip_h[g]
    for k in team_kits:
        kit_y[k] = y
        y += strip_h["player"]
    atlas = Image.new("RGBA", (W, y), (0, 0, 0, 0))
    for k, (g, hue, sat, val, rng) in KITS.items():
        for name, im in groups[g].items():
            r = layout[g][name]
            atlas.alpha_composite(recolor(im, hue, sat, val, rng), (r["x"], kit_y[k] + r["y"]))
    for k, kit in team_kits.items():
        for name, im in P.items():
            r = layout["player"][name]
            m = analyzed[name]
            atlas.alpha_composite(paint_kit(m, kit) if m else im, (r["x"], kit_y[k] + r["y"]))
    atlas.save(SPR / "atlas.png", optimize=True)

    run4 = ["P_step_a", "P_idle", "P_step_b", "P_idle"]
    anims = {
        "player": {
            "down_idle": ["P_idle"], "down_run": run4,
            "up_idle": ["U_idle"], "up_run": ["U_step_a", "U_idle", "U_step_b", "U_idle"],
            "side_idle": ["S_a"], "side_run": ["S_step_a", "S_a", "S_step_b", "S_a"],
            "kick_side": ["S_kick"],
            "slide": ["SL_1", "SL_2", "SL_3"], "slide_end": ["SL_end"],
        },
        "gk": {
            "down_idle": ["GK_stand"], "up_idle": ["GK_stand"], "side_idle": ["GK_stand"],
            "down_run": ["GK_stand", "GK_ready"] * 2, "up_run": ["GK_stand", "GK_ready"] * 2,
            "side_run": ["GK_stand", "GK_ready"] * 2,
            "dive_up": ["GK_dive_up_1", "GK_dive_up_2"], "dive_mid": ["GK_dive_mid_1", "GK_dive_mid_2"],
            "dive_low": ["GK_dive_low_1", "GK_dive_low_2", "GK_dive_low_3"], "catch": ["GK_catch_1", "GK_catch_2"],
        },
    }
    data = {
        "scale": DRAW_SCALE,
        "kits": {**{k: {"group": v[0], "y": kit_y[k]} for k, v in KITS.items()},
                 **{k: {"group": "player", "y": kit_y[k]} for k in team_kits}},
        "groups": {g: {"frames": layout[g]} for g in groups},
        "anims": anims,
    }
    (SPR / "atlas.js").write_text(
        "// GENERADO por tools/build_sprites.py - no editar a mano\nconst SPRITE_ATLAS = "
        + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")

    # ---- datos de los equipos para el juego ----
    lista = []
    for e in equipos:
        d = {"id": e["id"], "nombre": e["nombre"], "corto": e["corto"], "siglas": e["siglas"],
             "colores": e["ui"], "kit": f"team_{e['id']}"}
        if e.get("logo"):
            d["logo"] = e["logo"]
        lista.append(d)
    EQUIPOS_JS.write_text(
        "// GENERADO por tools/build_sprites.py desde tools/equipos.json - no editar a mano\nconst EQUIPOS = "
        + json.dumps(lista, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")

    # ---- vista previa (fondo de pasto) ----
    prev = Image.new("RGBA", atlas.size, (46, 125, 50, 255))
    prev.alpha_composite(atlas)
    prev.convert("RGB").save(ROOT / "tools" / "preview_atlas.png")
    print(f"OK atlas {atlas.size}, {len(P)} cuadros jugador + {len(G)} arquero, {len(team_kits)} equipos, escala de dibujo {DRAW_SCALE}")


if __name__ == "__main__":
    main()
