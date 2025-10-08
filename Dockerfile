# Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend ./
ENV CI=true
RUN corepack enable && pnpm install && pnpm run build

FROM ghcr.io/tsukinoko-kun/go-common:alpine AS backend
ENV CGO_ENABLED=1
RUN apk add --no-cache git build-base pkgconfig musl-dev
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
COPY --from=frontend /app/frontend/dist/assets ./public/assets
COPY --from=frontend /app/frontend/dist/*.html ./public/
COPY --from=frontend /app/frontend/dist/*.svg ./public/
RUN sqlc generate && \
    go build -a -installsuffix cgo -ldflags="-linkmode external -extldflags '-static' -s -w" -o teamsync main.go

FROM scratch
COPY --from=backend /app/backend/teamsync /teamsync
VOLUME /data
ENTRYPOINT ["/teamsync"]
