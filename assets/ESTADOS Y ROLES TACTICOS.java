public enum RolTactico {
    ARQUERO, DEFENSOR, MEDIOCAMPISTA, DELANTERO
}

public enum EstadoIA {
    POSICION_BASE,    // Retorna a su zona asignada
    DESMARQUE,        // Busca espacios libres en ataque
    CONDUCCION,       // Avanza con el balón hacia el arco
    MARCA_INDIVIDUAL, // Sigue a un rival específico
    PRESION,          // Persigue activamente el balón
    ACHIQUE_ARQUERO,  // El arquero sale a cortar el mano a mano
    BARRIDA           // Ejecuta el quite al ras del piso
}