# Mejoras de interfaz – Liga Chaquito F8

- Menú principal integrado con el arte `assets/opt/pantalla.webp` (spray original del proyecto).
- Zonas interactivas accesibles para **Jugar**, **Rangos de jugadores** y **Configuración**.
- Panel de rangos con el spray de estadísticas y panel de configuración para activar/desactivar la música.
- El partido comienza al pulsar **Jugar**; al volver desde el menú final, la simulación queda pausada.
- Diseño adaptable a pantallas pequeñas y grandes, manteniendo la proporción del arte y del campo.
- Controles táctiles en dispositivos con pantalla táctil: dirección, sprint, tiro, pase y cambio de jugador.
- Canvas escalado por densidad de píxeles para mejorar la nitidez en pantallas de alta resolución.

## Verificación

Se ejecutaron `node --check game.js` y `python tools/check_project.py`; ambos finalizaron correctamente.

Abrir `index.html` mediante un servidor local o el hosting estático habitual del proyecto.

## Pausa durante el partido
- Tecla Escape para pausar y volver al partido.
- Menú de pausa con CONTINUAR, REINICIAR y SALIR DEL PARTIDO.
- Navegación por teclado (flechas/W-S y Enter) y selección con clic/toque.
- Botón PAUSA disponible en los controles táctiles de celulares.
- La simulación y el reloj del partido quedan detenidos mientras está pausado.

## Selección de equipo
- Al pulsar **Jugar** aparece la pantalla **ELEGÍ TU EQUIPO** (12 equipos) y luego **ELEGÍ TU RIVAL** (o RIVAL AL AZAR, que evita camisetas casi iguales).
- Cada equipo juega con sus colores (camiseta a rayas, mangas, short y medias): El Boguero, Macabro, Cattarino F.C., Barrio Fino, Choborra, Retoneta F.C., Monarca F.C., Norwhisky F.C., Agustintos, Trotenham F.C., Botajogo y La Tikineta.
- La Retoneta usa su logo (`assets/opt/retoneta.webp`); los demás equipos tienen un escudo generado con sus colores y siglas.
- El marcador muestra el escudo y el nombre de cada equipo. Revancha y reinicio conservan los equipos elegidos.
- Los arqueros mantienen su camiseta rosa / violeta.

## Dificultad del rival
- Tras elegir equipo y rival aparece **ELEGÍ LA DIFICULTAD** con FÁCIL, NORMAL y DIFÍCIL (flujo: equipo → rival → dificultad; ESC o el botón vuelven un paso).
- El nivel elegido se muestra bajo el reloj del marcador. DIFÍCIL: rival veloz e incansable, presión doble, remates precisos y arquero de primera.
- Detalles y calibración en `tools/README.md` (sección *Dificultades*).

## Camisetas
- 6 diseños (rayas, lisa, mitades, aros, banda, franja central), mangas, puños de medias y número con contraste automático.


## Selector de modo de juego (actualización)
- Al pulsar **Jugar** se muestra el selector gráfico de modos adjunto.
- PC usa `assets/opt/menu_modos_pc.png` a pantalla completa y celular usa `assets/opt/menu_modos_mobile.png` en orientación vertical, centrado si el teléfono está girado.
- Las cuatro zonas transparentes de botones son controles HTML reales, accesibles con teclado y táctiles: Jugar solo, Jugar en línea, Liga offline y Volver.
- Jugar solo y en línea conservan los flujos existentes de selección de equipos; Liga offline abre el menú de liga existente. Escape también vuelve al menú anterior.
