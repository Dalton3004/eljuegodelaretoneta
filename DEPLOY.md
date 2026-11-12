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
- El disco es efímero: si reinician el servicio, cuentas/ranking pueden resetearse
  (el multiplayer en vivo sigue funcionando igual).

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
