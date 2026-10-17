FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# dependencias (sin las de desarrollo)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# los datos viven en un volumen; el proceso no corre como root
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV DB_FILE=/data/portfolio.db PORT=8787 HOST=0.0.0.0
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
