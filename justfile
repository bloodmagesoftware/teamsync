db:
    cd backend && sqlc generate

frontend:
    cd frontend && pnpm install && pnpm run dev

backend:
    cd backend && air

fmt:
    cd backend && go fmt
    cd frontend && pnpm run lint:fix
