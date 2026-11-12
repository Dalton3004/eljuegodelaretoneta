public class Pelota {
    public Vector2D posicion;
    public Vector2D velocidad;

    public Pelota(Vector2D posInicial) {
        this.posicion = posInicial;
        this.velocidad = new Vector2D(0, 0);
    }

    public void actualizarFisica() {
        // Sumar la velocidad a la posición actual
        posicion.x += velocidad.x;
        posicion.y += velocidad.y;

        // Fricción constante para que el tiro se detenga lentamente (ejemplo: pasto sintético/cemento)
        velocidad.x *= 0.98;
        velocidad.y *= 0.98;

        // Detener por completo si la velocidad es ínfima
        if (Math.abs(velocidad.x) < 0.1) velocidad.x = 0;
        if (Math.abs(velocidad.y) < 0.1) velocidad.y = 0;
    }
}