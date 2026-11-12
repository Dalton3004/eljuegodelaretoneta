#!/usr/bin/env python3
"""
Liga Chaquito F8 - Animaciones y "game feel" por jugador.

Genera assets/animaciones.js a partir de tools/animaciones_jugadores.json. El juego (fx.js)
lo lee al arrancar: cada jugador tiene su propia personalidad de movimiento (carrera, rebote,
respiración, tics al estar parado, festejo de gol), los tiempos/secuencias de cada acción
(patada con anticipación, barrida con levantada, estirada del arquero) y las curvas horneadas
(rebote, aterrizaje, salto, pulso, patada, zancada) para que los golpes de animación se sientan
elásticos y con ritmo de arcade.

Si assets/animaciones.js no existe o falla, el juego sigue funcionando igual (usa valores por
defecto o directamente sin efectos): nada de esto es obligatorio para jugar.

Uso (desde la carpeta del proyecto):
  python3 tools/configurar_animaciones.py                       # regenera el .js con la config actual
  python3 tools/configurar_animaciones.py --listar              # muestra la config
  python3 tools/configurar_animaciones.py --preset exagerado    # sobrio | dinamico | exagerado
  python3 tools/configurar_animaciones.py --jugador local_1 --festejo giro --estilo elastico --nervio 1.4
  python3 tools/configurar_animaciones.py --sacudida 0.5 --particulas 0.6 --sin-estela

Jugadores: local_0..local_3, local_gk, rival_0..rival_3, rival_gk
Festejos:  salto | giro | baile | punos | rodillas (el goleador se desliza de rodillas)
Estilos:   normal | elastico | pesado | ligero
"""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "tools" / "animaciones_jugadores.json"
OUTPUT = ROOT / "assets" / "animaciones.js"

JUGADORES = ["local_0", "local_1", "local_2", "local_3", "local_gk",
             "rival_0", "rival_1", "rival_2", "rival_3", "rival_gk"]
FESTEJOS = ["salto", "giro", "baile", "punos", "rodillas"]
ESTILOS = ["normal", "elastico", "pesado", "ligero"]

# Cada preset fija la intensidad general y cómo "rebota" el resorte (frecuencia y amortiguación).
PRESETS = {
    "sobrio":    dict(intensidad=0.70, sacudida=0.50, particulas=0.60, freq=1.9, zeta=0.45),
    "dinamico":  dict(intensidad=1.00, sacudida=1.00, particulas=1.00, freq=2.2, zeta=0.28),
    "exagerado": dict(intensidad=1.35, sacudida=1.50, particulas=1.50, freq=2.6, zeta=0.20),
}

# Tiempos y fases de las acciones (fx.js los lee si están; si no, usa sus propios defaults).
#  - patada: windup corto con S_windup -> golpe (S_kick) -> recuperación elástica
#  - barrida: entrada rápida (SL_1) -> deslizamiento sostenido (SL_2/SL_3) -> levantada (SL_end -> SL_1)
#  - arquero: caída amortiguada después de la estirada (GK_dive_low_3 -> GK_ready)
ACCIONES_DEFECTO = {
    "patada": {
        "duracion": 0.34,
        "windup_frac": 0.22,
        "impacto_frac": 0.56,
        "cuadro_windup": "S_windup",
        "cuadro_impacto": "S_kick",
    },
    "barrida": {
        "fases": [
            {"cuadro": "SL_1", "hasta": 0.20},
            {"cuadro": "SL_2", "hasta": 0.68},
            {"cuadro": "SL_3", "hasta": 1.00},
        ],
        "levantarse_duracion": 0.42,
        "levantarse_fases": [
            {"cuadro": "SL_end", "hasta": 0.42},
            {"cuadro": "SL_1",   "hasta": 0.78},
        ],
    },
    "arquero": {
        "aterrizaje_duracion": 0.30,
        "aterrizaje_fases": [
            {"cuadro": "GK_dive_low_3", "hasta": 0.55},
            {"cuadro": "GK_ready",      "hasta": 1.00},
        ],
        "alerta_distancia": 210,
    },
    "transiciones": {
        "arranque_duracion": 0.18,
        "freno_duracion": 0.22,
        "giro_duracion": 0.20,
    },
}

DEFECTO_JUGADOR = {
    "local_0":  dict(festejo="rodillas", estilo="normal",   nervio=1.0, rebote=1.0, inclinacion=1.0, respiracion=1.0),
    "local_1":  dict(festejo="giro",     estilo="pesado",   nervio=0.8, rebote=0.9, inclinacion=1.1, respiracion=1.1),
    "local_2":  dict(festejo="baile",    estilo="ligero",   nervio=1.3, rebote=1.1, inclinacion=0.9, respiracion=1.0),
    "local_3":  dict(festejo="salto",    estilo="elastico", nervio=1.1, rebote=1.2, inclinacion=1.0, respiracion=0.9),
    "local_gk": dict(festejo="punos",    estilo="pesado",   nervio=0.7, rebote=0.8, inclinacion=0.8, respiracion=1.2),
    "rival_0":  dict(festejo="salto",    estilo="ligero",   nervio=1.2, rebote=1.0, inclinacion=1.0, respiracion=1.0),
    "rival_1":  dict(festejo="punos",    estilo="normal",   nervio=1.0, rebote=1.0, inclinacion=1.0, respiracion=1.0),
    "rival_2":  dict(festejo="rodillas", estilo="elastico", nervio=1.4, rebote=1.2, inclinacion=1.1, respiracion=0.9),
    "rival_3":  dict(festejo="giro",     estilo="pesado",   nervio=0.9, rebote=0.9, inclinacion=1.1, respiracion=1.1),
    "rival_gk": dict(festejo="punos",    estilo="pesado",   nervio=0.7, rebote=0.8, inclinacion=0.8, respiracion=1.2),
}

RANGOS = dict(intensidad=(0.3, 1.8), sacudida=(0.0, 2.0), particulas=(0.0, 2.0),
              nervio=(0.2, 2.5), rebote=(0.4, 1.8), inclinacion=(0.3, 1.8), respiracion=(0.3, 2.0))

MUESTRAS = 48  # puntos por curva horneada


def config_inicial():
    p = PRESETS["dinamico"]
    return {
        "global": {"preset": "dinamico", "intensidad": p["intensidad"], "sacudida": p["sacudida"],
                   "particulas": p["particulas"], "estela": True, "festejos": True},
        "acciones": json.loads(json.dumps(ACCIONES_DEFECTO)),
        "jugadores": {k: dict(v) for k, v in DEFECTO_JUGADOR.items()},
    }


def resorte(freq_hz, zeta, muestras=MUESTRAS):
    """Respuesta de un resorte amortiguado desplazado a 1 y soltado en reposo, en t = 0..1.
    Se integra paso a paso (Euler semi-implícito) y se normaliza para que parta de 1."""
    w = 2 * math.pi * freq_hz
    pasos = 4000
    dt = 1.0 / pasos
    x, v = 1.0, 0.0
    salida = []
    cada = pasos // (muestras - 1)
    for i in range(pasos + 1):
        if i % cada == 0 and len(salida) < muestras:
            salida.append(round(x, 4))
        a = -w * w * x - 2 * zeta * w * v
        v += a * dt
        x += v * dt
    return salida


def curva_patada(muestras=MUESTRAS):
    """Curva con anticipación y golpe: primero negativea (-0.55 = se encoge/toma envío),
    en t≈0.22 salta a +1.0 (impacto / extensión máxima) y vuelve amortiguado a 0."""
    out = []
    t_hit = 0.22
    for i in range(muestras):
        t = i / (muestras - 1)
        if t < t_hit:
            u = t / t_hit
            v = -0.55 * math.sin(u * math.pi * 0.85)
        else:
            u = (t - t_hit) / (1.0 - t_hit)
            v = math.cos(u * math.pi * 2.4) * math.exp(-3.8 * u)
        out.append(round(v, 4))
    return out


def curvas(preset):
    f, z = PRESETS[preset]["freq"], PRESETS[preset]["zeta"]
    n = MUESTRAS
    ts = [i / (n - 1) for i in range(n)]
    return {
        # golpe elástico: arranca en 1 (estirón) y oscila hasta 0
        "rebote": resorte(f, z),
        # aterrizaje/control de pelota: se hunde y se asienta con poco rebote
        "asentar": resorte(f * 0.65, min(0.9, z + 0.30)),
        # salto: parábola con un poco de "tiempo en el aire" en la cima
        "salto": [round(max(0.0, 1 - (2 * t - 1) ** 2) ** 0.85, 4) for t in ts],
        # pulso: sube y baja suave (inclinaciones, desplazamientos)
        "pulso": [round(math.sin(math.pi * t) ** 1.3, 4) for t in ts],
        # patada: anticipación negativa -> impacto positivo -> rebote corto
        "patada": curva_patada(n),
        # zancada: rebote de carrera con apoyo firme (valle plano) y vuelo marcado (pico redondeado)
        "zancada": [round(math.sin(math.pi * t) ** 0.72, 4) for t in ts],
    }


def validar(nombre, valor):
    lo, hi = RANGOS[nombre]
    if not lo <= valor <= hi:
        raise SystemExit(f"--{nombre} debe estar entre {lo} y {hi}")
    return round(valor, 3)


def cargar():
    if CONFIG.exists():
        data = json.loads(CONFIG.read_text(encoding="utf-8"))
    else:
        data = config_inicial()
    base = config_inicial()
    data.setdefault("global", {})
    for k, v in base["global"].items():
        data["global"].setdefault(k, v)
    data.setdefault("acciones", {})
    for k, v in base["acciones"].items():
        data["acciones"].setdefault(k, v)
    data.setdefault("jugadores", {})
    for j in JUGADORES:
        data["jugadores"].setdefault(j, dict(DEFECTO_JUGADOR[j]))
    return data


def escribir(data):
    preset = data["global"].get("preset", "dinamico")
    if preset not in PRESETS:
        preset = "dinamico"
    CONFIG.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    salida = {
        "version": 2,
        "global": data["global"],
        "acciones": data["acciones"],
        "jugadores": data["jugadores"],
        "curvas": curvas(preset),
    }
    OUTPUT.write_text("// Generado por tools/configurar_animaciones.py. No editar a mano.\n"
                      "window.ANIMACIONES = " + json.dumps(salida, ensure_ascii=False, indent=1) + ";\n",
                      encoding="utf-8")
    print(f"OK  {OUTPUT.relative_to(ROOT)}  (preset={preset}, {len(data['jugadores'])} jugadores, "
          f"{MUESTRAS} muestras por curva)")


def listar(data):
    g = data["global"]
    print("GLOBAL:", ", ".join(f"{k}={v}" for k, v in g.items()))
    cols = ["festejo", "estilo", "nervio", "rebote", "inclinacion", "respiracion"]
    print(f"{'jugador':<10}" + "".join(f"{c:>13}" for c in cols))
    for j in JUGADORES:
        print(f"{j:<10}" + "".join(f"{str(data['jugadores'][j][c]):>13}" for c in cols))


def main():
    ap = argparse.ArgumentParser(description="Configurar animaciones y game feel")
    ap.add_argument("--listar", action="store_true", help="mostrar la configuración y salir")
    ap.add_argument("--preset", choices=PRESETS, help="sobrio | dinamico | exagerado")
    ap.add_argument("--intensidad", type=float, help="intensidad general (0.3-1.8)")
    ap.add_argument("--sacudida", type=float, help="sacudida de pantalla (0-2)")
    ap.add_argument("--particulas", type=float, help="cantidad de polvo/estrellas/confeti (0-2)")
    ap.add_argument("--estela", action=argparse.BooleanOptionalAction, default=None,
                    help="estela en tiros fuertes (--sin-estela la apaga)")
    ap.add_argument("--festejos", action=argparse.BooleanOptionalAction, default=None,
                    help="festejos y lamentos tras el gol (--no-festejos los apaga)")
    ap.add_argument("--jugador", choices=JUGADORES, help="jugador al que se aplican las opciones de abajo")
    ap.add_argument("--festejo", choices=FESTEJOS)
    ap.add_argument("--estilo", choices=ESTILOS)
    for n in ("nervio", "rebote", "inclinacion", "respiracion"):
        ap.add_argument(f"--{n}", type=float)
    a = ap.parse_args()

    data = cargar()
    g = data["global"]

    if a.preset:
        g["preset"] = a.preset
        for k in ("intensidad", "sacudida", "particulas"):
            g[k] = PRESETS[a.preset][k]
    for k in ("intensidad", "sacudida", "particulas"):
        v = getattr(a, k)
        if v is not None:
            g[k] = validar(k, v)
    if a.estela is not None:
        g["estela"] = a.estela
    if a.festejos is not None:
        g["festejos"] = a.festejos

    por_jugador = [a.festejo, a.estilo, a.nervio, a.rebote, a.inclinacion, a.respiracion]
    if any(v is not None for v in por_jugador):
        if not a.jugador:
            ap.error("para cambiar festejo/estilo/nervio/... indicá --jugador")
        j = data["jugadores"][a.jugador]
        if a.festejo:
            j["festejo"] = a.festejo
        if a.estilo:
            j["estilo"] = a.estilo
        for n in ("nervio", "rebote", "inclinacion", "respiracion"):
            v = getattr(a, n)
            if v is not None:
                j[n] = validar(n, v)
    elif a.jugador:
        ap.error("--jugador necesita al menos una opción: --festejo, --estilo, --nervio, ...")

    if a.listar:
        listar(data)
        return
    escribir(data)
    listar(data)


if __name__ == "__main__":
    main()
