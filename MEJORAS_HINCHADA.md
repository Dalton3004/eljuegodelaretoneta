# Hinchada animada

- `assets/hinchada/` -> `fans.js` (módulo Crowd), `fans_atlas.png/js` (42 sprites), `sprites/` (PNG sueltos).
- Se dibuja en `Game.render()` justo después de la cancha (detrás de jugadores, pelota y FX), sobre las gradas pintadas
  de `cancha.webp`: 4 laterales (escala 0.4) y 3 de fondo (escala 0.3). Se ajustan en `Game._initHinchada()`.
- Gol: `fx.js` (`_setMode('gol')`) llama `hinchada.goal('north'|'south', {fraction})`. Ola de festejo desde el arco,
  brazos arriba, bufandas/banderas, ~45% se para y salta; si el gol es del rival festeja solo la mitad.
- Tiros peligrosos: `Game._updateHinchada()` detecta pelota rápida hacia un arco y llama `hinchada.chance()`.
- Pausa: la hinchada se congela. Si falta el atlas/`fans.js`, el juego sigue sin hinchada.
- `tools/hinchada/`: scripts Python que recortan los sprites del spritesheet original.
