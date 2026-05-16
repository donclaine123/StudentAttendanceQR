# QR Attendance System

Monorepo layout:

- `apps/api` - Express + MySQL backend
- `apps/web` - static frontend

## Deploy the backend on Render

Render can deploy the backend directly from the repo root using the included `render.yaml` blueprint.

1. Create a new Render Web Service from this repository.
2. Use the service defined in `render.yaml`, or set these values manually:
	- Root directory: `apps/api`
	- Build command: `npm ci`
	- Start command: `npm start`
	- Health check path: `/health`
3. Add the environment variables below in Render:
	- `NODE_ENV=production`
	- `DB_HOST`
	- `DB_PORT`
	- `DB_USER`
	- `DB_PASS`
	- `DB_NAME`
	- `SESSION_SECRET`
	- `EMAIL_USER`
	- `EMAIL_PASS`
	- `ADMIN_SECRET`
	- `FRONTEND_URL`
	- `API_URL`
4. Keep `apps/api/certs/ca.pem` in the repo. The backend uses it for the MySQL SSL connection.

## Frontend

The frontend can stay on Netlify for now. Its proxy already points to the Render backend. If you later move the frontend to another host, set `FRONTEND_URL` to that site URL and the backend will allow it through CORS.
