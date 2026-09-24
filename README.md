# life-kit

Personal life-tracking webapp. First feature: a workout planner/tracker, built and
editable by both a human (web UI) and AI agents (via MCP).

Monorepo (npm workspaces):
- `apps/backend` — REST API + SQLite (the only thing that writes to the DB)
- `apps/frontend` — React/Vite SPA
- `apps/mcp-server` — MCP server, a thin HTTP client of the backend, for agent access
- `packages/shared` — TypeScript types shared across all three

## Running locally

Prereqs: Node 22+, npm.

```
npm install
```

Each app needs its own `.env` (gitignored — copy from the matching `.env.example`
and fill in real values):

```
cp apps/backend/.env.example apps/backend/.env
cp apps/mcp-server/.env.example apps/mcp-server/.env
```

`apps/backend/.env` needs:
- `ADMIN_PASSWORD_HASH` — generate with `npm run hash-password -w apps/backend -- 'your password'`
- `API_TOKEN` — any random string, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

`apps/mcp-server/.env` needs:
- `BACKEND_API_TOKEN` — same value as `API_TOKEN` above
- `MCP_AUTH_TOKEN` — a separate random string, generated the same way

Then, in separate terminals from the repo root:

```
npm run dev:backend    # API on :3001
npm run dev:frontend   # SPA on :5173, proxies /api to the backend
npm run dev:mcp        # MCP server on :3002 (only needed for agent testing)
```

Open **http://localhost:5173** and log in with the password you hashed above.
The SQLite file is created automatically on first run at
`apps/backend/data/life-kit.sqlite`.

### Useful scripts (from repo root)

```
npm run typecheck   # typecheck every workspace
npm run build        # build every workspace
```

## Running on the GCP instance (production)

The app runs there via Docker Compose: `caddy` (reverse proxy + auto-HTTPS +
serves the built frontend), `backend`, and `mcp-server`.

**SSH in** (tunnels through IAP — SSH is not open to the public internet):
```
gcloud compute ssh life-kit --zone=us-central1-a --tunnel-through-iap
```

**Start/restart everything** (also picks up any code changes after a `git pull`):
```
cd ~/life-kit
git pull
docker compose up -d --build
```

**Check status / logs:**
```
docker compose ps
docker compose logs -f caddy      # watch for successful cert issuance
docker compose logs -f backend
docker compose logs -f mcp-server
```

**Stop everything:**
```
docker compose down
```
(add `-v` only if you intentionally want to wipe the SQLite volume — don't do
this casually, it deletes all workout data)

Production secrets live in `apps/backend/.env`, `apps/mcp-server/.env`, and the
root `.env` (all gitignored, created by hand on the box — never committed).
One gotcha: any `$` in a value in `apps/backend/.env` or `apps/mcp-server/.env`
(e.g. inside the bcrypt password hash) must be doubled to `$$`, since Docker
Compose's `env_file` loader interpolates `$` otherwise.

Once running, the app is live at `https://life.bawgz.com`.
