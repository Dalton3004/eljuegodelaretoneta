# Liga Chaquito F8 — Jugar ONLINE entre todos

Este juego necesita un servidor Node.js con WebSockets (Socket.io).
No sirve Netlify, GitHub Pages ni Vercel “estático”: ahí no corre el multiplayer.

Abajo van 3 opciones que SÍ funcionan. Empezá por Railway.

────────────────────────────────────────
1) RAILWAY (recomendada)
────────────────────────────────────────
Sitio: https://railway.app

1. Creá cuenta (GitHub o email).
2. Subí esta carpeta a un repositorio de GitHub.
3. En Railway: New Project → Deploy from GitHub repo → elegí el repo.
4. Railway detecta Node solo. Si pide comando de inicio:
   npm start
5. Settings → Networking → Generate Domain
6. Copiá la URL (ej: https://liga-chaquito-f8-production.up.railway.app)

Todos abren ESA URL → Configuración → Registrarse → Jugar → Online.

Notas:
- En el plan free/hobby puede haber límites de horas al mes.
- El disco normal es efímero: con cada deploy (versión nueva) se borra. Para que las
  cuentas NO se pierdan, agregá un Volume (ver "CUENTAS Y VERSIONES NUEVAS" abajo).

────────────────────────────────────────
2) GLITCH (muy fácil, ideal para probar)
────────────────────────────────────────
Sitio: https://glitch.com

1. New Project → Import from GitHub (o subí los archivos).
2. Asegurate de que package.json tenga "start": "node server.js"
3. Glitch levanta solo el servidor.
4. Abrí la URL .glitch.me y compartila.

Limitaciones: se duerme si nadie entra; el proyecto puede ser público.

────────────────────────────────────────
3) FLY.IO (más “pro”, WebSockets excelentes)
────────────────────────────────────────
Sitio: https://fly.io

1. Instalá flyctl y hacé fly auth login
2. En esta carpeta: fly launch
3. Confirmá la app y deploy: fly deploy
4. Usá la URL https://TU-APP.fly.dev

Hay free allowance mensual generoso para un juego chico.

────────────────────────────────────────
Local (solo tu PC / misma red)
────────────────────────────────────────
npm install
npm start
→ http://127.0.0.1:3001

Para jugar con amigos fuera de tu red hace falta un host de arriba
(o un túnel tipo Cloudflare Tunnel / ngrok apuntando al puerto 3001).

────────────────────────────────────────
Qué ya está listo en el código
────────────────────────────────────────
- PORT desde variable de entorno
- Escucha en 0.0.0.0
- Socket.io con CORS abierto + websocket/polling
- Cliente usa location.origin en producción
- /health para health checks
- Cuentas, ranking y matchmaking en el mismo servidor

Compartí la URL pública y a jugar entre todos.

────────────────────────────────────────
CUENTAS Y VERSIONES NUEVAS (que no se pierdan)
────────────────────────────────────────
Las cuentas, el ranking y el historial se guardan en UN archivo (liga.json). Ya no está
dentro de la carpeta del proyecto, así que cambiar de versión no lo toca. Dónde queda:

  1. LIGA_DATA        → ruta completa del archivo (si la definís)
  2. LIGA_DATA_DIR / DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH → carpeta (un Volume)
  3. /data o /var/data si existen (Fly.io / Render con disco)
  4. ~/.liga-chaquito-f8/   → en tu PC (lo comparten TODAS las versiones del juego)
  5. data/ del proyecto     → solo si no queda otra

En TU PC no tenés que hacer nada: todas las versiones usan la misma carpeta, y si había
un data/liga.json viejo se migra solo la primera vez.

EN UN HOSTING (Railway / Render / Fly) el disco se borra en cada deploy, así que hace falta
un disco persistente:
  - Railway: servicio → Settings → Volumes → New Volume, mount path /data.
             (Railway define RAILWAY_VOLUME_MOUNT_PATH solo; no hay que hacer más.)
  - Render:  necesita plan pago con "Disk" (mount path /var/data). En el plan free NO hay disco.
  - Fly.io:  fly volumes create liga_data --size 1   y en fly.toml agregar:
               [mounts]
                 source = "liga_data"
                 destination = "/data"
Al arrancar, el servidor imprime dónde guarda las cuentas y avisa si detecta un hosting
sin disco persistente.

Protecciones: cada guardado deja una copia (.bak) y una por día (últimos 7). Si liga.json
se rompe, se aparta (liga.json.roto-...) y se recupera la última copia buena; nunca se pisa
con uno vacío.

RESPALDO MANUAL (recomendado antes de cambiar de hosting): definí la variable ADMIN_TOKEN
con una clave larga y secreta, y:
  Bajar:      https://TU-SITIO/api/admin/respaldo?clave=TU_ADMIN_TOKEN
  Restaurar:  curl -X POST -H "Authorization: Bearer TU_ADMIN_TOKEN" \
                   -H "Content-Type: application/json" \
                   --data-binary @liga-respaldo.json https://TU-SITIO/api/admin/restaurar
Restaurar SUMA las cuentas del respaldo; nunca borra ni pisa las que ya existen. Sin
ADMIN_TOKEN estas rutas no existen. El respaldo contiene las claves hasheadas: guardalo
como algo privado.
