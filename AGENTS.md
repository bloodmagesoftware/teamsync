# Agents instructions

TeamSync is a team communication platform. In features similar to Slack. In philosophy and self-hosting similar to Campfire (by 37signals).

Write modern Go and TypeScript code and adhere to best practices.

## Backend

Sqlc is used for database access and query generation. Sqlc uses the migrations to generate the database schema (in memory) and uses this schema to compile the queries in `./backend/db/queries/` to Go.

The database is Sqlite.

Add migrations to the database at `./backend/db/migrations/`.

The backend provides a Web API for the frontend and is not available for direct user access.

## Frontend

React is used for the frontend with Vite as the bundler.

### Styling

Tailwind CSS v4 is used for styling. No `tailwind.config.js`.

Avoid using flex. Use grid or other layouts like absolute positioned inside relative positioned parent elements. Margins are also a good option for spacing.

## License

AGPL v3.0

Make sure this copyright notice is at the top of every code file (as a comment): `Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)`
