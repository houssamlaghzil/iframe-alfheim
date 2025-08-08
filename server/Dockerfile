# server/Dockerfile
FROM node:20.19-alpine

WORKDIR /app
ENV NODE_ENV=production

# dépendances
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# code
COPY server ./

# dossier uploads persistant
RUN mkdir -p /app/uploads

# port API
EXPOSE 4000

CMD ["node", "index.js"]
