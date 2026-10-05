# ==========================================
# CLIPBOX BACKEND
# Node 22 + yt-dlp + Deno + BgUtils + FFmpeg
# ==========================================

FROM node:22-slim

# ------------------------------------------
# Dependencias del sistema
# ------------------------------------------

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    git \
    unzip \
 && ln -sf /usr/bin/python3 /usr/bin/python \
 && rm -rf /var/lib/apt/lists/*


# ------------------------------------------
# Instalar yt-dlp
# ------------------------------------------

RUN curl -fsSL \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp


# ------------------------------------------
# Instalar Deno
# ------------------------------------------

RUN curl -fsSL https://deno.land/install.sh \
    | DENO_INSTALL=/usr/local sh \
 && ln -sf /usr/local/bin/deno /usr/bin/deno


# ------------------------------------------
# Descargar BgUtils POT Provider
# ------------------------------------------

WORKDIR /opt

RUN git clone \
    --depth 1 \
    --branch 2.0.0 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
    bgutil-ytdlp-pot-provider


# ------------------------------------------
# Compilar servidor BgUtils
# ------------------------------------------

WORKDIR /opt/bgutil-ytdlp-pot-provider/server

RUN npm ci --omit=dev \
 && npm ci \
 && npx tsc


# ------------------------------------------
# Instalar plugin BgUtils para yt-dlp
# ------------------------------------------

RUN mkdir -p /home/node/yt-dlp-plugins/bgutil-ytdlp-pot-provider \
 && cp -r /opt/bgutil-ytdlp-pot-provider/plugin/* \
    /home/node/yt-dlp-plugins/bgutil-ytdlp-pot-provider/


# ------------------------------------------
# Clipbox
# ------------------------------------------

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev \
 && npm cache clean --force

COPY server.js ./


# ------------------------------------------
# Variables
# ------------------------------------------

ENV NODE_ENV=production
ENV YT_DLP_PATH=yt-dlp
ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1


# ------------------------------------------
# Usuario no-root
# ------------------------------------------

RUN chown -R node:node /app /opt/bgutil-ytdlp-pot-provider /home/node/yt-dlp-plugins

USER node


# ------------------------------------------
# Puerto
# ------------------------------------------

EXPOSE 10000


# ------------------------------------------
# Arranque
# ------------------------------------------

CMD ["sh", "-c", "node /opt/bgutil-ytdlp-pot-provider/server/build/main.js --host 127.0.0.1 --port 4416 & node /app/server.js"]
