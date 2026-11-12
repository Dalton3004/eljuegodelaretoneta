public class Vector2D {
    public double x, y;

    public Vector2D(double x, double y) {
        this.x = x;
        this.y = y;
    }

    // Calcula la distancia real entre dos puntos
    public double distancia(Vector2D otro) {
        return Math.hypot(this.x - otro.x, this.y - otro.y);
    }

    // Devuelve un nuevo vector apuntando del punto A al punto B
    public Vector2D direccionHacia(Vector2D objetivo) {
        double dx = objetivo.x - this.x;
        double dy = objetivo.y - this.y;
        double magnitud = Math.hypot(dx, dy);
        
        if (magnitud == 0) return new Vector2D(0, 0);
        return new Vector2D(dx / magnitud, dy / magnitud);
    }

    public void sumar(Vector2D otro, double multiplicador) {
        this.x += otro.x * multiplicador;
        this.y += otro.y * multiplicador;
    }

    public Vector2D clonar() {
        return new Vector2D(this.x, this.y);
    }
}