public class GestorPartido {
    // --- TIEMPO Y ESTADO ---
    // 3 minutos = 180 segundos. A 60 FPS = 10800 frames
    public int framesRestantes = 180 * 60; 
    public EstadoPartido estado = EstadoPartido.EN_JUEGO;
    public int timerFestejo = 0; // Temporizador para reanudar tras un gol
    
    // --- MARCADOR ---
    public int golesLocal = 0;
    public int golesRival = 0;

    // --- LÍMITES DE LA CANCHA (Perspectiva vertical) ---
    private final double LIMITE_IZQ = 50.0;
    private final double LIMITE_DER = 718.0;
    private final double LIMITE_SUP = 50.0;  // Línea de fondo Norte
    private final double LIMITE_INF = 974.0; // Línea de fondo Sur

    // Ancho de los arcos en el eje X
    private final double POSTE_IZQ = 324.0;
    private final double POSTE_DER = 444.0;

    // Referencias a los objetos del juego
    public Pelota pelota;
    public GestorIA gestorIA; // El gestor de jugadores que hicimos antes
    
    // Interfaz (UI)
    public String spriteCartelActual = ""; // Puede ser "GOL", "VICTORIA", "DERROTA", "EMPATE"

    public GestorPartido(Pelota pelota, GestorIA gestorIA) {
        this.pelota = pelota;
        this.gestorIA = gestorIA;
        resetearCancha();
    }

    // --- BUCLE PRINCIPAL (Llamado a 60 FPS) ---
    public void actualizarPartido() {
        switch (estado) {
            case EN_JUEGO:
                actualizarJuego();
                break;
            case CELEBRANDO_GOL:
                manejarFestejo();
                break;
            case FINALIZADO:
                // El juego queda bloqueado mostrando el resultado final
                break;
        }
    }

    private void actualizarJuego() {
        // Descontar reloj
        framesRestantes--;

        if (framesRestantes <= 0) {
            finalizarPartido();
            return;
        }

        // 1. Mover la pelota (aplicar fricción e inercia)
        pelota.actualizarFisica();

        // 2. Colisiones de la pelota con las paredes invisibles
        mantenerPelotaEnCancha();

        // 3. Chequear si la pelota entró en algún arco
        verificarGoles();

        // 4. Mover a los jugadores (humanos e IA)
        // gestorIA.procesarFrames(pelota.posicion, pelota.obtenerPortador());
    }

    private void mantenerPelotaEnCancha() {
        // Rebote en el lateral izquierdo
        if (pelota.posicion.x <= LIMITE_IZQ) {
            pelota.posicion.x = LIMITE_IZQ;
            pelota.velocidad.x *= -0.8; // Rebota perdiendo un poco de fuerza
        }
        // Rebote en el lateral derecho
        if (pelota.posicion.x >= LIMITE_DER) {
            pelota.posicion.x = LIMITE_DER;
            pelota.velocidad.x *= -0.8;
        }

        // Rebote en la línea de fondo Norte (Arco Rival)
        if (pelota.posicion.y <= LIMITE_SUP) {
            if (pelota.posicion.x < POSTE_IZQ || pelota.posicion.x > POSTE_DER) {
                // Pegó en los carteles al lado del arco
                pelota.posicion.y = LIMITE_SUP;
                pelota.velocidad.y *= -0.8;
            }
        }

        // Rebote en la línea de fondo Sur (Arco Propio)
        if (pelota.posicion.y >= LIMITE_INF) {
            if (pelota.posicion.x < POSTE_IZQ || pelota.posicion.x > POSTE_DER) {
                // Pegó en los carteles al lado del arco
                pelota.posicion.y = LIMITE_INF;
                pelota.velocidad.y *= -0.8;
            }
        }
    }

    private void verificarGoles() {
        // Gol del Local (Entra por el norte)
        if (pelota.posicion.y <= LIMITE_SUP && pelota.posicion.x >= POSTE_IZQ && pelota.posicion.x <= POSTE_DER) {
            golesLocal++;
            registrarGol();
        }
        // Gol del Rival (Entra por el sur)
        else if (pelota.posicion.y >= LIMITE_INF && pelota.posicion.x >= POSTE_IZQ && pelota.posicion.x <= POSTE_DER) {
            golesRival++;
            registrarGol();
        }
    }

    private void registrarGol() {
        estado = EstadoPartido.CELEBRANDO_GOL;
        spriteCartelActual = "GOL"; // Dispara el render del sprite "¡GOL!" en pantalla
        timerFestejo = 180; // 3 segundos de pausa a 60 FPS
        
        // Aquí podrías disparar la animación de los jugadores festejando
    }

    private void manejarFestejo() {
        timerFestejo--;
        if (timerFestejo <= 0) {
            resetearCancha();
            spriteCartelActual = ""; // Quitar el cartel
            estado = EstadoPartido.EN_JUEGO;
        }
    }

    private void resetearCancha() {
        // La pelota vuelve al centro del mediocampo muerta (sin velocidad)
        pelota.posicion = new Vector2D((LIMITE_IZQ + LIMITE_DER) / 2, (LIMITE_SUP + LIMITE_INF) / 2);
        pelota.velocidad = new Vector2D(0, 0);
        
        // Cada jugador vuelve a la posición que le indica la formación
        for (JugadorIA bot : gestorIA.equipoLocal) {
            bot.posicion = bot.posicionTacticaOriginal.clonar();
            bot.animacionActual = "PARADO";
        }
        for (JugadorIA bot : gestorIA.equipoVisitante) {
            bot.posicion = bot.posicionTacticaOriginal.clonar();
            bot.animacionActual = "PARADO";
        }
    }

    private void finalizarPartido() {
        estado = EstadoPartido.FINALIZADO;
        
        if (golesLocal > golesRival) {
            spriteCartelActual = "VICTORIA";
        } else if (golesRival > golesLocal) {
            spriteCartelActual = "DERROTA";
        } else {
            spriteCartelActual = "EMPATE";
        }
        
        // Aquí podrías guardar las estadísticas en la base de datos local para la tabla de posiciones
    }

    // --- FORMATEO PARA INTERFAZ ---
    public String obtenerTiempoFormateado() {
        int segundosTotales = framesRestantes / 60;
        int minutos = segundosTotales / 60;
        int segundos = segundosTotales % 60;
        return String.format("%02d:%02d", minutos, segundos); // Devuelve "03:00", "01:45", etc.
    }
}