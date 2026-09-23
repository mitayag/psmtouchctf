# syntax=docker/dockerfile:1
# Multi-stage production edge image:
#   1. Builds the React frontend (no Node.js required on the host)
#   2. Serves the built assets with the production nginx configuration
FROM node:22-bookworm-slim AS ui-builder

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /build

COPY ui/package.json ui/package-lock.json ./
RUN npm ci

COPY ui/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=ui-builder /build/dist /usr/share/nginx/html
COPY edge/nginx.prod.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
