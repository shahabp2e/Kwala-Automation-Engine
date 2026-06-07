# Kwala Automation Deployer Center —

## Structure

```
backend/    Express + @libsql/client + ethers (Node.js)
frontend/   Next.js 14 + React 18 + Tailwind (no TypeScript)
```

## Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env with your values
npm install
npm run dev      # node --watch src/index.js
# or
npm start        # node src/index.js
```

## Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local:
#   BACKEND_URL=http://localhost:3001
#   NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
npm install
npm run dev
```

Frontend runs on http://localhost:3000 by default.
