import java.util.List;

public class JugadorIA {
    public int dorsal;
    public boolean esEquipoLocal;
    public RolTactico rol;
    
    public Vector2D posicion;
    public Vector2D posicionTacticaOriginal; 
    
    // Atributos físicos (simulando los rangos de estadísticas)
    public double velocidadBase = 2.5;
    public double velocidadSprint = 4.8;
    public double estamina = 100.0;
    
    public EstadoIA estado = EstadoIA.POSICION_BASE;
    public String animacionActual = "PARADO";

    public JugadorIA(int dorsal, RolTactico rol, boolean esEquipoLocal, Vector2D posInicial) {
        this.dorsal = dorsal;
        this.rol = rol;
        this.esEquipoLocal = esEquipoLocal;
        this.posicion = posInicial.clonar();
        this.posicionTacticaOriginal = posInicial.clonar();
    }

    public void actualizarIA(Vector2D posBalon, JugadorIA portadorBalon, 
                             List<JugadorIA> aliados, List<JugadorIA> rivales, 
                             Vector2D arcoPropio, Vector2D arcoRival) {
        
        recuperarEstamina();

        // Lógica exclusiva del Arquero
        if (this.rol == RolTactico.ARQUERO) {
            logicaArquero(posBalon, arcoPropio);
            return;
        }

        boolean posesionAliada = (portadorBalon != null && portadorBalon.esEquipoLocal == this.esEquipoLocal);
        boolean posesionRival = (portadorBalon != null && portadorBalon.esEquipoLocal != this.esEquipoLocal);

        if (posesionAliada) {
            if (this == portadorBalon) {
                // Jugador con el balón: Conduce hacia el arco
                conducirBalon(arcoRival);
            } else {
                // Jugador sin balón: Busca línea de pase (Desmarque)
                ejecutarDesmarque(arcoRival, rivales);
            }
        } else if (posesionRival) {
            // Fase defensiva
            defender(posBalon, rivales, aliados, arcoPropio);
        } else {
            // Pelota dividida (suelta)
            irPorBalonDividido(posBalon, aliados);
        }
    }

    // --- MÉTODOS DE COMPORTAMIENTO ---

    private void conducirBalon(Vector2D arcoRival) {
        estado = EstadoIA.CONDUCCION;
        moverHacia(arcoRival, velocidadSprint);
        consumirEstamina();
    }

    private void ejecutarDesmarque(Vector2D arcoRival, List<JugadorIA> rivales) {
        estado = EstadoIA.DESMARQUE;
        
        // Proyecta su posición original hacia el ataque según su rol
        double avance = (rol == RolTactico.DELANTERO) ? 100 : (rol == RolTactico.MEDIOCAMPISTA) ? 60 : 30;
        Vector2D dirAtaque = posicionTacticaOriginal.direccionHacia(arcoRival);
        Vector2D puntoIdeal = new Vector2D(
            posicionTacticaOriginal.x + (dirAtaque.x * avance),
            posicionTacticaOriginal.y + (dirAtaque.y * avance)
        );

        // Repulsión: Se aleja de los rivales para pedir el pase libre
        Vector2D evasion = calcularRepulsion(rivales, 50.0);
        puntoIdeal.sumar(evasion, 1.0);

        moverHacia(puntoIdeal, velocidadBase);
    }

    private void defender(Vector2D posBalon, List<JugadorIA> rivales, List<JugadorIA> aliados, Vector2D arcoPropio) {
        double distBalon = posicion.distancia(posBalon);

        // Si es el aliado más cercano a la pelota, va a presionar
        if (soyElMasCercano(posBalon, aliados)) {
            if (distBalon < 25.0 && estamina > 20) {
                estado = EstadoIA.BARRIDA;
                animacionActual = "BARRIDA";
                moverHacia(posBalon, velocidadSprint * 1.2); // Impulso extra para barrer
            } else {
                estado = EstadoIA.PRESION;
                moverHacia(posBalon, velocidadSprint);
                consumirEstamina();
            }
        } else {
            // Si no es el más cercano, marca al rival libre o cubre zona
            marcarEnZona(rivales, arcoPropio);
        }
    }

    private void marcarEnZona(List<JugadorIA> rivales, Vector2D arcoPropio) {
        estado = EstadoIA.MARCA_INDIVIDUAL;
        JugadorIA rivalAsignado = buscarRivalMasCercano(rivales);

        if (rivalAsignado != null) {
            // Se posiciona entre el rival y el propio arco (corta la línea de tiro)
            Vector2D dirAlArco = rivalAsignado.posicion.direccionHacia(arcoPropio);
            Vector2D cobertura = new Vector2D(
                rivalAsignado.posicion.x + (dirAlArco.x * 30),
                rivalAsignado.posicion.y + (dirAlArco.y * 30)
            );
            moverHacia(cobertura, velocidadBase);
        } else {
            moverHacia(posicionTacticaOriginal, velocidadBase);
        }
    }

    private void logicaArquero(Vector2D posBalon, Vector2D arcoPropio) {
        double distBalonArco = arcoPropio.distancia(posBalon);

        // Achique si el delantero entra al área
        if (distBalonArco < 150.0) {
            estado = EstadoIA.ACHIQUE_ARQUERO;
            Vector2D dirPelota = arcoPropio.direccionHacia(posBalon);
            Vector2D posicionAchique = new Vector2D(
                arcoPropio.x + (dirPelota.x * 40),
                arcoPropio.y + (dirPelota.y * 40)
            );
            moverHacia(posicionAchique, velocidadSprint);
        } else {
            // Báscula sobre la línea de gol siguiendo la X de la pelota
            estado = EstadoIA.POSICION_BASE;
            double posX = Math.max(arcoPropio.x - 40, Math.min(arcoPropio.x + 40, posBalon.x));
            moverHacia(new Vector2D(posX, arcoPropio.y), velocidadBase);
        }
    }

    // --- UTILIDADES FÍSICAS ---

    private void moverHacia(Vector2D destino, double vel) {
        double dist = posicion.distancia(destino);
        if (dist > 2.0) {
            Vector2D direccion = posicion.direccionHacia(destino);
            posicion.sumar(direccion, vel);
            
            // Asigna animación en base a la velocidad
            if (estado != EstadoIA.BARRIDA) {
                animacionActual = (vel >= velocidadSprint) ? "CORRER" : "CAMINAR";
            }
        } else if (estado != EstadoIA.BARRIDA) {
            animacionActual = "PARADO";
        }
    }

    private Vector2D calcularRepulsion(List<JugadorIA> rivales, double radioEvasion) {
        Vector2D fuerza = new Vector2D(0, 0);
        for (JugadorIA r : rivales) {
            double dist = posicion.distancia(r.posicion);
            if (dist < radioEvasion && dist > 0) {
                Vector2D huida = r.posicion.direccionHacia(posicion);
                fuerza.sumar(huida, radioEvasion / dist); // Más repulsión cuanto más cerca
            }
        }
        return fuerza;
    }

    private boolean soyElMasCercano(Vector2D objetivo, List<JugadorIA> grupo) {
        double miDist = posicion.distancia(objetivo);
        for (JugadorIA j : grupo) {
            if (j != this && j.rol != RolTactico.ARQUERO && j.posicion.distancia(objetivo) < miDist) {
                return false;
            }
        }
        return true;
    }

    private JugadorIA buscarRivalMasCercano(List<JugadorIA> rivales) {
        JugadorIA cercano = null;
        double minD = Double.MAX_VALUE;
        for (JugadorIA r : rivales) {
            if (r.rol != RolTactico.ARQUERO) {
                double d = posicionTacticaOriginal.distancia(r.posicion);
                if (d < minD) { minD = d; cercano = r; }
            }
        }
        return cercano;
    }

    private void consumirEstamina() {
        if (estamina > 0) estamina -= 0.5;
        if (estamina < 0) estamina = 0;
    }

    private void recuperarEstamina() {
        if (estado == EstadoIA.POSICION_BASE || estado == EstadoIA.MARCA_INDIVIDUAL) {
            if (estamina < 100) estamina += 0.2;
        }
    }
}