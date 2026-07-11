# GNOSIS · instalación en escritorio (Podman / Docker)

Esta carpeta es el **bundle de instalación**: contiene todo lo necesario para
correr GNOSIS como un contenedor autocontenido. GNOSIS es un proceso Flask
(servido por gunicorn) con SQLite local-first — no necesita base de datos
externa ni backend. La imagen incluye Java 17 (lo requiere el pipeline de
extracción de PDFs); todo lo demás es Python.

Todo funciona igual con Docker — cambia `podman` por `docker`.

```
docker/
├── Containerfile     imagen (multi-stage, no-root, healthcheck, gunicorn)
├── Dockerfile        espejo del Containerfile (para docker build)
├── compose.yaml      orquestación (construye desde el repo padre)
├── .env.example      plantilla de secretos → copiar a ../.env
├── install.sh        instalador de un comando
└── README.md         esta guía
```

> Los archivos `.containerignore` / `.dockerignore` viven en la **raíz del
> repo** (deben estar en la raíz del contexto de build para excluir el `.env`,
> la BD local y los artefactos de la imagen). No los muevas.

---

## Instalación rápida (un comando)

Desde la raíz del repo:

```bash
./docker/install.sh
```

Detecta el motor (podman-compose / docker compose), crea `.env` desde la
plantilla (te pide editarlo), construye la imagen y levanta el servicio.
Abre **http://127.0.0.1:5001**.

---

## Instalación manual

### 1 · Secretos

```bash
cp docker/.env.example .env
```

Edita `.env` y pon al menos `DEEPSEEK_API_KEY` (para el chat) y una
`FLASK_SECRET_KEY` fuerte:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2 · Levantar con compose

```bash
podman-compose -f docker/compose.yaml up -d --build
# o:  docker compose -f docker/compose.yaml up -d --build
```

### 2 (alt) · Podman a mano, sin compose

```bash
podman build -t gnosis:local -f docker/Containerfile .

podman volume create gnosis_data
podman volume create gnosis_uploads
podman volume create gnosis_downloads

podman run -d --name gnosis \
  -p 127.0.0.1:5001:5001 \
  --env-file .env \
  -v gnosis_data:/app/data \
  -v gnosis_uploads:/app/uploads \
  -v gnosis_downloads:/app/downloads \
  --restart unless-stopped \
  gnosis:local
```

---

## Arranque automático en el escritorio (Quadlet + systemd)

Para que GNOSIS arranque solo al iniciar sesión, crea
`~/.config/containers/systemd/gnosis.container`:

```ini
[Unit]
Description=GNOSIS · analítica aduanal VW
After=network-online.target

[Container]
Image=gnosis:local
ContainerName=gnosis
PublishPort=127.0.0.1:5001:5001
EnvironmentFile=%h/gnosis/.env
Volume=gnosis_data:/app/data
Volume=gnosis_uploads:/app/uploads
Volume=gnosis_downloads:/app/downloads

[Service]
Restart=always

[Install]
WantedBy=default.target
```

Ajusta `EnvironmentFile` a la ruta real de tu `.env`. Luego:

```bash
podman build -t gnosis:local -f docker/Containerfile .
systemctl --user daemon-reload
systemctl --user start gnosis
loginctl enable-linger "$USER"     # arranca sin sesión abierta
```

> En macOS/Windows usa Podman Desktop: instalación rápida con compose y marca
> el contenedor como *autostart* en la interfaz.

---

## Datos y respaldo

Tres volúmenes persistentes sobreviven a `down`/`restart`/rebuild:

| Volumen | Contenido |
|---------|-----------|
| `gnosis_data` | la BD SQLite (`aduanas.db`) |
| `gnosis_uploads` | facturas e insumos acumulados |
| `gnosis_downloads` | Excel / ZIP generados |

Respaldo del volumen de datos:

```bash
podman volume export gnosis_data --output gnosis_data_backup.tar
```

Exportar el grafo de evidencia:
`GET http://127.0.0.1:5001/api/v1/autogenes/exportar` → bundle JSON.

---

## Solución de problemas

| Síntoma | Arreglo |
|---------|---------|
| `env file .env not found` | Corre `cp docker/.env.example .env`. |
| El chat no responde | `DEEPSEEK_API_KEY` vacía en `.env` (el resto sí funciona). |
| Puerto 5001 ocupado | Cambia el mapeo a `127.0.0.1:5002:5001` en `compose.yaml`. |
| Falla al procesar PDFs | El pipeline necesita Java; la imagen ya lo trae — reconstruye con este `Containerfile`. |
| Sesiones se reinician | Define `FLASK_SECRET_KEY` en `.env`. |

## Seguridad

- Corre como **usuario no-root** (`gnosis`).
- Puerto atado a **127.0.0.1** — no se expone a la LAN.
- **gunicorn** (WSGI de producción), `debug` apagado.
- El `.env` con secretos **nunca** entra a la imagen.
