# Étape 1: build Vite (Node compatible vite@7)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Étape 2: Nginx pour servir le build + proxy /api
FROM nginx:alpine
# configuration nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf
# assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
