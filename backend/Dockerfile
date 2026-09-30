# ---------- Etapa 1: compilar TypeScript ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: imagen de ejecución ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docs ./docs
COPY db ./db
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
