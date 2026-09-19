FROM node:22-bookworm-slim

WORKDIR /app

ARG VITE_ML_API_URL=http://localhost:8000
ENV VITE_ML_API_URL=$VITE_ML_API_URL

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npx", "wrangler", "dev", "--config", "dist/server/wrangler.json", "--ip", "0.0.0.0", "--port", "3000"]
