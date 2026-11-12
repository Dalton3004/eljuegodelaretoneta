#!/usr/bin/env python3
"""Corre todo en orden: sprites -> carteles -> animaciones -> imágenes WebP -> verificación. (Simulación: node tools/simulate.js)"""
import subprocess, sys
from pathlib import Path
T = Path(__file__).parent
for s in ("build_sprites.py", "retoque_sprites.py", "build_ui.py", "configurar_animaciones.py", "optimize_assets.py", "check_project.py"):
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, str(T / s)]).returncode:
        sys.exit(f"Falló {s}")
