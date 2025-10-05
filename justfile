db:
    cd backend && sqlc generate

frontend:
    cd frontend && pnpm install && pnpm run dev

backend:
    cd backend && FRONTEND_DEV_URL=http://localhost:5173 air

fmt:
    cd backend && go fmt
    cd frontend && pnpm run lint:fix

build:
    cd frontend && pnpm run build
    rm -rf backend/public
    cp -r frontend/dist backend/public

prod:
    just build
    cd backend && go run .
