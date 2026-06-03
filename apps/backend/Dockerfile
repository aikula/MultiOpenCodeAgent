FROM node:20-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN npm ci --omit=dev --workspace=@moca/backend --workspace=@moca/shared

# tsx needed at runtime for dev-mode execution
RUN npm install -g tsx

COPY packages/shared/ ./packages/shared/
COPY apps/backend/ ./apps/backend/

RUN mkdir -p /app/data/workspaces && git config --global user.email "moca@local" && git config --global user.name "MOCA"

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/app.db
ENV WORKSPACES_ROOT=/app/data/workspaces

EXPOSE 3000

CMD ["tsx", "apps/backend/src/index.ts"]
