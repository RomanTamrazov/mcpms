FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npx", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--ip", "0.0.0.0", "--port", "3000"]
#запуск
#cd C:\Users\user\Desktop\LCT\mcpms\website
#docker compose up -d

#стоп
#docker compose down

#пересобрать
#docker compose up -d --build

#http://localhost:3000