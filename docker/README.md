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
├── INSTALL_MAC.md    guía paso a paso para macOS (Podman)
└── README.md         esta guía
```

> Los archivos `.containerignore` / `.dockerignore` viven en la **raíz del
> repo** (deben estar en la raíz del contexto de build para excluir el `.env`,
> la BD local y los artefactos de la imagen). No los muevas.

---

## Requisitos de disco (medidos)

Números reales de una construcción de este `Containerfile` (build validado:
compila, `requirements.txt` instala, la imagen arranca y sirve `/health`):

| Concepto | Tamaño |
|---|---|
| **Imagen construida** (en disco) | **~1.2 GB** — venv Python ~763 MB · Java 17 ~184 MB · OCR (tesseract+poppler) + base Debian slim |
| Pico transitorio durante el build (caché de capas, recuperable) | ~2–3 GB |
| Máquina Podman (VM Linux en macOS) — **solo la primera vez** | ~2–3 GB |
| Datos de trabajo (BD, facturas) — crece con el uso | desde ~0.5 GB |

**Recomendación de espacio libre:**
- Con Podman/Docker ya instalado: **~5–6 GB**.
- Instalando Podman de cero (suma la VM): **~8 GB**.

Tras el primer build, recupera el transitorio con `podman system prune`
(la imagen estable queda en ~1.2 GB). El primer build tarda varios minutos
(descarga Java, OCR y las libs Python); los siguientes usan caché.

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

> **macOS:** sigue la guía dedicada [`INSTALL_MAC.md`](./INSTALL_MAC.md) —
> instala Podman con Homebrew, arranca la `podman machine` y usa
> `./docker/install.sh`. Con Podman Desktop puedes marcar el contenedor como
> *autostart* desde la interfaz.

---

## Empaquetar para otra máquina (Mac / otro equipo)

Cuando alguien pide "un contenedor de GNOSIS para probar en su máquina", la
vía correcta es **enviar el fuente y construir allá**, NO una imagen ya hecha.

**Por qué fuente y no imagen pre-construida:**
- La imagen es específica de arquitectura. Una imagen construida en **amd64**
  (Intel/servidor) corre **emulada** en un Mac **Apple Silicon (arm64)** —
  lenta y a veces rota. Construir en la máquina destino da la imagen nativa.
- El fuente pesa ~2–3 MB; una imagen exportada (`podman save`) pesa ~400 MB
  comprimida (~1.2 GB al cargar). Transferir el fuente es más liviano y correcto.
- El build en destino usa el internet normal de esa máquina (sin proxies/CA
  raros) y hornea la imagen que le toca.

**Cómo armar el bundle de fuente** (solo lo versionado, sin `.git`, datos ni
artefactos — respeta `.gitignore`):

```bash
git archive --format=zip --prefix=GNOSIS/ -o GNOSIS-$(git rev-parse --short HEAD).zip HEAD
```

El destinatario:

```bash
unzip GNOSIS-*.zip && cd GNOSIS
./docker/install.sh          # crea .env, construye NATIVO y levanta
# → http://127.0.0.1:5001
```

Disco necesario en su máquina: ver «Requisitos de disco» arriba (~5–6 GB con
Podman ya instalado; ~8 GB de cero).

> **Excepción — Intel/mismo arch:** si el destino es Intel (amd64) igual que
> donde construyes, sí puedes enviar la imagen ya hecha:
> `podman save gnosis:local | gzip > gnosis.tar.gz` → allá
> `gunzip -c gnosis.tar.gz | podman load`. Para Apple Silicon: no lo hagas,
> construye en el Mac.

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
