import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;

public class JugadorController implements KeyListener {
    // Coordenadas y atributos de velocidad
    private int x, y;
    private int velocidadNormal = 3;
    private int velocidadCorriendo = 6;
    private boolean corriendo = false;

    // Banderas de estado de movimiento continuo
    private boolean movArriba, movAbajo, movIzquierda, movDerecha;

    // Método que debe ser llamado en el bucle principal del juego (Game Loop, ~60 FPS)
    public void actualizarPosicion() {
        int velocidadActual = corriendo ? velocidadCorriendo : velocidadNormal;
        
        if (movArriba) y -= velocidadActual;
        if (movAbajo) y += velocidadActual;
        if (movIzquierda) x -= velocidadActual;
        if (movDerecha) x += velocidadActual;
    }

    @Override
    public void keyPressed(KeyEvent e) {
        int tecla = e.getKeyCode();

        // Controles de movimiento (WASD)
        if (tecla == KeyEvent.VK_W) movArriba = true;
        if (tecla == KeyEvent.VK_A) movIzquierda = true;
        if (tecla == KeyEvent.VK_S) movAbajo = true;
        if (tecla == KeyEvent.VK_D) movDerecha = true;

        // Mecánica de Sprint (Shift)
        if (tecla == KeyEvent.VK_SHIFT) corriendo = true;

        // Controles de Acción (Pelota)
        if (tecla == KeyEvent.VK_E) {
            pasarPelota();
        }
        if (tecla == KeyEvent.VK_R) {
            tirarCentro();
        }
        if (tecla == KeyEvent.VK_SPACE) {
            patearOCabecear();
        }
    }

    @Override
    public void keyReleased(KeyEvent e) {
        int tecla = e.getKeyCode();

        // Detener movimiento al soltar tecla
        if (tecla == KeyEvent.VK_W) movArriba = false;
        if (tecla == KeyEvent.VK_A) movIzquierda = false;
        if (tecla == KeyEvent.VK_S) movAbajo = false;
        if (tecla == KeyEvent.VK_D) movDerecha = false;

        // Volver a velocidad normal al soltar Shift
        if (tecla == KeyEvent.VK_SHIFT) corriendo = false;
    }

    @Override
    public void keyTyped(KeyEvent e) {
        // No se utiliza para controles de acción directa
    }

    // --- Lógica de Acciones ---

    private void pasarPelota() {
        System.out.println("Ejecutando pase a ras del suelo (E).");
        // Aquí instanciarías la trayectoria lineal de la pelota hacia el aliado más cercano
    }

    private void tirarCentro() {
        System.out.println("Ejecutando centro elevado (R).");
        // Aquí aplicarías parábola y eje Z a la física del balón
    }

    private void patearOCabecear() {
        // Para diferenciar, el juego debe calcular la altura (eje Z) del balón en colisión
        boolean pelotaEnElAire = verificarAlturaPelota(); 
        
        if (pelotaEnElAire) {
            System.out.println("¡Cabezazo en el aire!");
            cambiarAnimacion("CABECEAR"); 
        } else {
            System.out.println("¡Remate al arco!");
            cambiarAnimacion("PATEAR");
        }
    }

    private boolean verificarAlturaPelota() {
        // Lógica dummy: retorna true si la pelota está a la altura de la cabeza
        return true; 
    }

    private void cambiarAnimacion(String estado) {
        // Lógica para actualizar el frame del sprite actual
    }
}