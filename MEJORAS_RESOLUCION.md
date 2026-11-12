# Mejora de resolución y pantalla completa

- El menú principal en PC ahora ocupa todo el viewport (`100vw × 100svh`) y conserva la proporción del arte usando `cover`.
- El partido en PC admite un área de visualización mucho mayor (hasta 960 px de ancho lógico de pantalla, limitada por la altura para conservar 3:4).
- El Canvas utiliza un framebuffer interno 2x adicional combinado con el `devicePixelRatio`, manteniendo intactas las coordenadas y la lógica existentes del juego.
- Se desactivó el suavizado del Canvas para conservar los bordes nítidos del estilo pixel-art.
- No se modificaron las velocidades, físicas, IA, controles ni dimensiones lógicas del campo.
