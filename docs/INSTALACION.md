# Instalar GNOSIS en un escritorio con Podman

GNOSIS corre como un contenedor autocontenido: un proceso Flask (servido por
gunicorn) con SQLite local-first. No necesita base de datos externa ni
backend. La imagen incluye Java 17 (lo requiere el pipeline de extracción de
PDFs); todo lo demás es Python.

Todo funciona igual con Docker — cambia `podman` por `docker` y
`podman-compose` por `docker compose`.

---

## 1 · Requisitos

- **Podman** 4.0+ (`podman --version`). En Windows/macOS: Podman Desktop.
- Opcional pero recomendado: **podman-compose** (`pip install podman-compose`)
  o el plugin `podman compose`.
- ~2 GB de disco para la imagen (incluye el JRE y el stack de data-science).

---

## 2 · Configurar los secretos (una vez)

```bash
cp .env.example .env
```

Edita `.env` y pon al menos tu `DEEPSEEK_API_KEY` (para el chat Gnosis·IA) y
una `FLASK_SECRET_KEY` fuerte:

```bash
python -c "import secrets; print(secrets.token_hex(32))"   # pega el resultado en FLASK_SECRET_KEY
```

El `.env` está gitignoreado y NO entra a la imagen: los secretos se inyectan
en runtime.

---

## 3 · Levantar (opción A · compose, la más simple)

```bash
podman-compose up -d --build
```

Abre **http://127.0.0.1:5001**. Listo.

Comandos útiles:

```bash
podman-compose logs -f          # ver logs
podman-compose down             # detener (los datos persisten en volúmenes)
podman-compose up -d --build    # actualizar tras cambios de código
```

## 3 · Levantar (opción B · Podman a mano, sin compose)

```bash
# construir la imagen
podman build -t gnosis:local -f Containerfile .

# volúmenes persistentes (una vez)
podman volume create gnosis_data
podman volume create gnosis_uploads
podman volume create gnosis_downloads

# correr
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

## 4 · Instalarlo como servicio del escritorio (arranque automático)

Para que GNOSIS arranque solo al iniciar sesión, usa **Quadlet** (la forma
idiomática de Podman de definir contenedores como servicios systemd). Crea
el archivo:

`~/.config/containers/systemd/gnosis.container`

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
podman build -t gnosis:local -f Containerfile .   # la imagen debe existir
systemctl --user daemon-reload
systemctl --user start gnosis
loginctl enable-linger $USER        # arranca aunque no haya sesión abierta
```

Ahora GNOSIS vive en http://127.0.0.1:5001 y se reinicia solo. Gestión:

```bash
systemctl --user status gnosis
systemctl --user restart gnosis
journalctl --user -u gnosis -f
```

> En macOS/Windows con Podman Desktop, usa la opción A (compose) o marca el
> contenedor como "autostart" en la interfaz de Podman Desktop.

---

## 5 · Datos, respaldo y actualización

- **Persistencia:** tres volúmenes — `gnosis_data` (la BD SQLite),
  `gnosis_uploads` (facturas e insumos acumulados) y `gnosis_downloads`
  (Excel/ZIP generados). Sobreviven a `down`/`restart`/rebuild.
- **Respaldo:** GNOSIS ya hace checkpoint del WAL antes de copiar. Para un
  respaldo manual del volumen:
  ```bash
  podman volume export gnosis_data --output gnosis_data_backup.tar
  ```
- **Exportar el grafo:** `GET http://127.0.0.1:5001/api/v1/autogenes/exportar`
  entrega un bundle JSON del sustrato.
- **Actualizar:** `git pull` y luego `podman-compose up -d --build` (o
  reconstruye la imagen y reinicia el servicio Quadlet).

---

## 6 · Solución de problemas

| Síntoma | Causa / arreglo |
|---------|-----------------|
| `env file .env not found` al hacer `up` | Falta crear el `.env` — corre `cp .env.example .env`. |
| El chat no responde | `DEEPSEEK_API_KEY` vacía o inválida en `.env`. El resto de la app funciona sin ella. |
| El puerto 5001 está ocupado | Cambia el mapeo a `-p 127.0.0.1:5002:5001` (o edita el compose). |
| Falla al procesar PDFs | El pipeline necesita Java; la imagen ya lo trae. Si compilaste una variante sin JRE, reconstruye con el `Containerfile` provisto. |
| Las sesiones se reinician al reiniciar | Define `FLASK_SECRET_KEY` en `.env` (sin ella, la clave es efímera). |
| Permisos en el volumen (rootless) | Podman rootless mapea al usuario; la imagen ya deja `data/uploads/downloads` escribibles por el usuario `gnosis`. |

---

## Notas de seguridad

- El contenedor corre como **usuario no-root** (`gnosis`).
- El puerto se ata a **127.0.0.1** — no se expone a la red local. Para
  acceso remoto deliberado, cambia el mapeo y define `GNOSIS_TOKEN`.
- El servidor es **gunicorn** (WSGI de producción), no el dev server de
  Flask; `debug` está apagado dentro del contenedor.
- El `.env` con secretos nunca entra a la imagen (`.containerignore`).
