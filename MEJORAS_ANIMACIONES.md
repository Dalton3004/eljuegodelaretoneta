# Corrección de vibración en animaciones de caminata

## Problema detectado

La animación de caminata podía reiniciarse repetidamente cuando la velocidad del jugador oscilaba cerca del umbral de movimiento (`0.3`). Eso hacía que `animFrame` volviera a cero y el sprite alternara de forma brusca, especialmente al frenar, colisionar o quedar contra una pared.

Además, el render del sprite utilizaba suavizado de imagen y posiciones fraccionarias. En pixel art esto puede producir un desplazamiento/borrosidad aparente entre frames aunque la posición lógica del jugador sea estable.

## Cambios

- Se agregó histéresis al estado `moving`: comienza a animarse por encima de 0.30 y permanece en movimiento hasta bajar de 0.12.
- Se evita reiniciar innecesariamente la secuencia de frames durante pequeñas fluctuaciones de velocidad.
- El atlas se renderiza sin `imageSmoothing`.
- El anclaje visual se redondea a píxel lógico para estabilizar el sprite.
- No se modificaron velocidad, aceleración, física, IA, controles ni posiciones de los jugadores.

## Verificación

- `node --check game.js` — OK.
- `tools/test_collisions.cjs` — OK: frontal, posición idéntica, grupo y contacto estático.
- `tools/test_collision_cooldown.cjs` — OK: receptor protegido durante cooldown de 0.32 s.

No se pudo ejecutar un partido visual completo en navegador dentro del entorno disponible, por lo que la corrección visual se verificó mediante inspección del pipeline de animación/render y pruebas de código disponibles.

## Animaciones adicionales — versión ampliada

Se añadió una segunda capa de animación visual, sin modificar la física ni el estado de juego:

- Conducción con pelota: microfases de toque y acompañamiento corporal.
- Protección de pelota: inclinación y desplazamiento visual del torso al reducir velocidad.
- Tropezón de recuperación: reacción corta y amortiguada ante impactos fuertes.
- Anticipación de giro: el cuerpo acompaña los cambios bruscos de dirección.
- Las nuevas acciones se mezclan con sprint, caminata, pase, tiro y barrida existentes.
- Todas las transformaciones están limitadas para evitar deformaciones exageradas o vibraciones.

Estas animaciones son exclusivamente de renderizado: no modifican posiciones, velocidades, IA, física de la pelota ni colisiones.
