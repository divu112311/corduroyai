# CorduroyAI Monorepo

This repo contains the backend and frontend projects for CorduroyAI.

## Structure

- `backend/` – Python services, data pipelines, and embedding workflows
- `frontend/` – React/Vite frontend and serverless utilities

## Prerequisites

- Python 3.10+
- Node.js 18+
- Access to required external services (Supabase, OpenAI, Pinecone, GCS)

## Environment Variables

Create a local `.env` file in the relevant project folder(s) and set:

```
OPENAI_API_KEY=...
PINECONE_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

Other settings (GCS, project IDs, model names) are in `backend/corduroyai/config.py`.

## Backend (Python)

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r tradeai/requirements.txt
```

Common scripts live under `backend/corduroyai/` and `backend/Scripts/`.

## Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
```

## Notes

- Large data files and progress artifacts are intentionally ignored.
- Do not commit secrets. Use `.env` files or secret managers.
