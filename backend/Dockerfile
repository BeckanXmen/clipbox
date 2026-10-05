# Backend Clipbox para Render: Node + yt-dlp + Deno + ffmpeg
FROM node:22-slim

# Instalar ffmpeg, python3, ca-certificates y herramientas necesarias
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl unzip \
 && ln -s /usr/bin/python3 /usr/bin/python \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
 && ln -s /usr/local/bin/deno /usr/bin/deno \
 && yt-dlp --version \
 && deno --version \
 && apt-get purge -y curl unzip \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=production
ENV YT_DLP_PATH=yt-dlp

EXPOSE 10000

CMD ["node", "server.js"]
