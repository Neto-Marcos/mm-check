# Imagem da v2. A v1 (Java) tem o Dockerfile da raiz e nao e afetada.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma generate antes do build: o cliente tipado e usado na compilacao.
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Usuario sem privilegio: o processo nao precisa de root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# O build standalone ja traz as dependencias que o servidor usa.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma CLI, schema e migrations: necessarios para o migrate no start.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nextjs
EXPOSE 3000

# Aplica as migrations pendentes e so entao sobe. Se a migration falhar, o
# container nao sobe — melhor que servir com o schema errado.
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
