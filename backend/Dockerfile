# Backend Clipbox para Render: Node + yt-dlp + ffmpeg
FROM node:22-slim

# Instalar ffmpeg, python3, curl y descargar el binario oficial de yt-dlp
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && ln -s /usr/bin/python3 /usr/bin/python \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=production YT_DLP_PATH=yt-dlp

EXPOSE 10000

CMD ["node", "server.js"]
