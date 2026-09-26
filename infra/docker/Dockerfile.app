FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node","apps/web/server.js"]
