# ── Next.js + Prisma 배포 이미지 (Railway) ──────────────
FROM node:22-slim AS base
WORKDIR /app
# Prisma 엔진에 openssl 필요
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# 1) 의존성 설치 (prisma generate 포함: postinstall)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# 2) 빌드
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) 실행
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
# 배포 시 마이그레이션 적용 후 서버 기동 (Railway가 주입하는 PORT 사용)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start -- -p ${PORT:-3000}"]
