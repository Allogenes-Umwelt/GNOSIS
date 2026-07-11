# GNOSIS — imagen de contenedor para instalar en escritorio (Podman/Docker).
# Multi-stage: el builder compila las dependencias; el runtime queda delgado.
# Java (JRE 17) es necesario SOLO para el pipeline legado de extracción de
# PDFs (tabula/jpype en PDFs_v2.py); todo lo demás es Python puro.

# ===== BUILDER =====
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# gcc por si alguna dependencia compila extensiones C durante el pip install.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --upgrade pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ===== RUNTIME =====
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    JARVIS_DB_PATH=/app/data/aduanas.db

# JRE 17 headless (bookworm lo trae en main; openjdk-21 NO está en bookworm).
# curl para el HEALTHCHECK.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openjdk-17-jre-headless \
        curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY . /app

# Usuario no-root + directorios persistentes escribibles (los volúmenes
# heredan esta propiedad en el primer arranque).
RUN groupadd -r gnosis && useradd -r -g gnosis -d /app gnosis && \
    mkdir -p /app/data /app/uploads /app/downloads && \
    chown -R gnosis:gnosis /app/data /app/uploads /app/downloads
USER gnosis

VOLUME ["/app/data", "/app/uploads", "/app/downloads"]
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:5001/health || exit 1

# Servidor WSGI de producción (no el dev server de Flask). Bind a 0.0.0.0
# DENTRO del contenedor es correcto: la exposición la controla el mapeo de
# puerto de Podman. timeout alto por el procesamiento de PDFs.
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", \
     "--timeout", "600", "--access-logfile", "-", "app:app"]
