# ===== BUILDER STAGE =====
FROM python:3.11-slim as builder

WORKDIR /ara

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system deps + Java 21
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        openjdk-21-jre-headless && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN /opt/venv/bin/python -m pip install --upgrade pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ===== RUNTIME STAGE =====
FROM python:3.11-slim

WORKDIR /ara

# Install Java ONLY once
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openjdk-21-jre-headless && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy venv and app
COPY --from=builder /opt/venv /opt/venv
COPY . /ara

ENV PATH="/opt/venv/bin:$PATH"
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

VOLUME /ara/API_Aduanas/data

EXPOSE 5001

CMD ["sh", "-c", "java -version && python /ara/API_Aduanas/app.py"]
