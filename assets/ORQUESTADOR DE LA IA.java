import java.util.ArrayList;
import java.util.List;

public class GestorIA {
    public List<JugadorIA> equipoLocal = new ArrayList<>();
    public List<JugadorIA> equipoVisitante = new ArrayList<>();
    
    // Coordenadas fijas para la perspectiva Clash Royale
    public final Vector2D ARCO_NORTE = new Vector2D(384, 50);  
    public final Vector2D ARCO_SUR = new Vector2D(384, 974); 

    public void armarEquipos() {
        // Arquero, Defensor, Medio, Delantero (Equipo Propio - Ataca hacia arriba)
        equipoLocal.add(new JugadorIA(1, RolTactico.ARQUERO, true, new Vector2D(384, 940)));
        equipoLocal.add(new JugadorIA(7, RolTactico.DEFENSOR, true, new Vector2D(250, 750)));
        equipoLocal.add(new JugadorIA(10, RolTactico.MEDIOCAMPISTA, true, new Vector2D(518, 600)));
        equipoLocal.add(new JugadorIA(9, RolTactico.DELANTERO, true, new Vector2D(384, 450)));

        // Equipo Rival Calvo (Ataca hacia abajo)
        equipoVisitante.add(new JugadorIA(1, RolTactico.ARQUERO, false, new Vector2D(384, 80)));
        equipoVisitante.add(new JugadorIA(2, RolTactico.DEFENSOR, false, new Vector2D(518, 270)));
        equipoVisitante.add(new JugadorIA(5, RolTactico.MEDIOCAMPISTA, false, new Vector2D(250, 420)));
        equipoVisitante.add(new JugadorIA(9, RolTactico.DELANTERO, false, new Vector2D(384, 570)));
    }

    // Se llama en el bucle update(deltaTime)
    public void procesarFrames(Vector2D posicionBalon, JugadorIA jugadorConBalon) {
        for (JugadorIA bot : equipoLocal) {
            // Omite al jugador si está siendo controlado por el usuario humano
            if (botNoEsControladoPorUsuario(bot)) {
                bot.actualizarIA(posicionBalon, jugadorConBalon, equipoLocal, equipoVisitante, ARCO_SUR, ARCO_NORTE);
            }
        }

        for (JugadorIA botRival : equipoVisitante) {
            botRival.actualizarIA(posicionBalon, jugadorConBalon, equipoVisitante, equipoLocal, ARCO_NORTE, ARCO_SUR);
        }
    }
    
    private boolean botNoEsControladoPorUsuario(JugadorIA bot) {
        // Aquí integras la lógica para cederle el control del bot actual al Input del teclado
        return true; 
    }
}