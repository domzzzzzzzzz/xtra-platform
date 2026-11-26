# Production image. Runs migrations, makes sure the XTRA admin exists, then starts the API + web app.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npx tsx src/seed.ts && exec npx tsx src/server.ts"]
