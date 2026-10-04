# Backend Clipbox para Render: Node + yt-dlp + ffmpeg
FROM node:22-slim

# Instalar ffmpeg, python3, pip, curl
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip python3-dev ca-certificates curl \
 && ln -s /usr/bin/python3 /usr/bin/python \
 && python3 -m pip install --no-cache-dir --upgrade pip \
 && python3 -m pip install --no-cache-dir --upgrade yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=production YT_DLP_PATH=yt-dlp

EXPOSE 10000

CMD ["node", "server.js"]
