# Knowledge Retrieval Platform: RAG MVP

An MVP that shows the two core layers of the knowledge platform working end to end:

1. **Ingestion**: upload documents, which are parsed, chunked page by page, vectorized and stored in a vector DB.
2. **Retrieval / RAG**: search them with hybrid, semantic or keyword retrieval, and get an optional LLM answer that uses only the retrieved passages and cites them.

```
rag-proj/
├── api/                 NestJS backend (ingestion + retrieval layers)
├── ui/                  Next.js frontend (shadcn/ui components)
├── docker-compose.yml   Weaviate + embedding model + local LLM
└── Delhi_Police_Knowledge_Retrieval_Platform_Proposal.docx   (original proposal, superseded where noted below)
```

---

## Decisions taken (and how they differ from the proposal)

The proposal document was an early draft. For this MVP we **replace** its stack choices as follows:

| Area | Proposal said | MVP decision | Why |
|---|---|---|---|
| Vector / search engine | OpenSearch (BM25 + vector) | **Self-hosted Weaviate 1.40** | One system covers storage, vectorization, BM25, hybrid fusion and RAG generation. That leaves fewer moving parts for an MVP. |
| Embedding model | BGE-M3 / multilingual E5, run by our own service | **Weaviate `text2vec-transformers` module** with `paraphrase-multilingual-MiniLM-L12-v2` | Weaviate vectorizes objects on insert and queries at search time, so we don't run our own embedding pipeline. The model is multilingual (Hindi + English) and runs on CPU. You can switch to `intfloat-multilingual-e5-large` by changing one image tag. |
| Answer generation | **None**: strictly non-generative, excerpts only | **RAG through Weaviate `generative-ollama`** (local `llama3.2`), **can be turned off per request** | The MVP has to show RAG working. The model runs locally (no external AI APIs). The prompt restricts it to the retrieved passages and requires citations. Turn off "Generate answer" in the UI (or send `generate: false`) to get the excerpts-only behaviour the proposal described. |
| Backend | Python + FastAPI | **NestJS (TypeScript)** | One language across the monorepo. Uses the official `weaviate-client` v3 (gRPC). |
| Frontend | React + TypeScript | **Next.js 16 + shadcn/ui (Base UI)** | Ready-made accessible components, so we could build the demo UI quickly. |
| Metadata DB | PostgreSQL | **Not used**. Document metadata lives in a second Weaviate collection (`Document`) | Avoids running a second datastore for the MVP. Postgres comes back with users/RBAC/audit. |
| Background jobs | Celery + Redis | **None**. Ingestion runs synchronously inside the upload request | Good enough for demo-sized files. A queue (e.g. `@nestjs/bullmq`) is the first step to scaling. |
| Original file storage | Object storage | **Not stored**. Only extracted text plus its SHA-256 | Out of MVP scope. |
| OCR | Tesseract / PaddleOCR | **Not included**. Scanned PDFs are rejected with a clear message | Out of MVP scope. |
| Office parsing | Apache Tika | `pdf-parse` (PDF, per page) and `mammoth` (DOCX). TXT/MD read directly | Pure-Node, no JVM. |
| Identity / RBAC | Keycloak | **None** (open demo) | Out of MVP scope. |

### Things we kept from the proposal

- **Structure-aware chunking**: split on paragraphs, then sentences (including the Hindi danda `।`), and hard-split only as a last resort. Chunks are ~1000 chars with ~150 chars overlap. **Chunks never cross a page boundary**, so every passage has an exact page number.
- **Hybrid retrieval** (BM25 + vector) is the default. Weaviate's `relativeScoreFusion` combines the two, and `alpha` (0 = keyword, 1 = vector) can be changed in the UI.
- **Source traceability**: every passage returns its filename, page number and chunk index, and the UI shows them next to the passage.
- **No-result behaviour**: if no passages are retrieved, the UI says so, and the LLM is told to reply "documents do not contain enough information" rather than guess.
- **Integrity**: SHA-256 of each upload is stored and duplicate uploads are rejected.
- **No external AI APIs**: everything (embeddings + LLM) runs in local containers.

---

## Architecture

```
            ┌────────────┐  multipart upload   ┌──────────────────────────────────────────┐
            │  ui (Next) │ ──────────────────► │ api (Nest)                               │
            │  :3000     │                     │  IngestionModule                         │
            │            │  POST /ask          │   parse (pdf/docx/txt/md) → chunk → SHA  │
            │            │ ──────────────────► │  RetrievalModule                         │
            └────────────┘                     │   hybrid / nearText / bm25 [+ generate]  │
                                               └───────────────┬──────────────────────────┘
                                                               │ gRPC + REST (weaviate-client v3)
                                               ┌───────────────▼──────────────────────────┐
                                               │ Weaviate :8080 / :50051                  │
                                               │  Document       (metadata, no vectors)   │
                                               │  DocumentChunk  (text → vector + BM25)   │
                                               └───────┬───────────────────────┬──────────┘
                                     text2vec-transformers              generative-ollama
                                               ▼                               ▼
                                   t2v-transformers (multilingual)     ollama (llama3.2)
```

### Weaviate schema

- **`Document`**: `filename, mimeType, sizeBytes, sha256, pageCount, chunkCount, status (processing|ready|failed), error, uploadedAt`. No vectorizer.
- **`DocumentChunk`**: `text` (vectorized), `documentId`, `filename`, `page`, `chunkIndex`. Vectorizer: `text2vec-transformers` on `text` only. Generative: `generative-ollama`.

The API creates both collections on startup if they don't exist.

### API endpoints (`api`, default port 4000)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | API + Weaviate readiness |
| `POST` | `/documents` | `multipart/form-data`, field `files` (up to 10 files, 25 MB each). Each file is processed separately, so one bad file doesn't fail the others. |
| `GET` | `/documents` | List ingested documents |
| `GET` | `/documents/:id` | One document |
| `DELETE` | `/documents/:id` | Delete a document and all its chunks |
| `POST` | `/search` | Retrieval only. Body: `{ query, mode?: "hybrid"\|"semantic"\|"keyword", alpha?: 0..1, limit?: 1..50, documentId? }` |
| `POST` | `/ask` | RAG. Same body plus `generate?: boolean` (default `true`). Returns `{ answer, passages[], tookMs }` |

---

## Running it locally

**Prerequisites:** Node 22+, pnpm 10, Docker Desktop (8 GB+ RAM allocated; 16 GB recommended for the LLM).

```bash
# 1. Install JS deps for both apps
pnpm install

# 2. Start Weaviate, the embedding model and Ollama.
#    The ollama-pull container downloads llama3.2 (~2 GB) on first run.
pnpm infra:up
docker compose logs -f ollama-pull      # wait until the pull finishes

# 3. Configure (defaults work as-is)
cp api/.env.example api/.env
cp ui/.env.example  ui/.env.local

# 4. Run API (:4000) and UI (:3000) together
pnpm dev
```

Open http://localhost:3000, upload a few PDFs/DOCX files on the **Ingest** tab, then ask questions on the **Search** tab.

Quick API test without the UI:

```bash
curl -F "files=@./some.pdf" http://localhost:4000/documents
curl -s -X POST http://localhost:4000/ask -H 'Content-Type: application/json' \
  -d '{"query":"What is the procedure for X?","mode":"hybrid","generate":true}' | jq
```

**Mac performance tip:** Ollama inside Docker on macOS runs on CPU only. For much faster answers, install Ollama natively (`brew install ollama && ollama pull llama3.2`), remove the `ollama`/`ollama-pull` services, and set `OLLAMA_ENDPOINT=http://host.docker.internal:11434` in `api/.env`. That endpoint is called *by Weaviate*, which is why it's the container-visible address.

> `OLLAMA_ENDPOINT` / `OLLAMA_MODEL` are written into the `DocumentChunk` collection config when it is first created. If you change them later, delete the collection (`curl -X DELETE localhost:8080/v1/schema/DocumentChunk`) and re-ingest.

### Tests

```bash
pnpm test          # chunker unit tests (api)
pnpm build         # type-checks and builds api + ui
```

---

## Known MVP limitations / next steps

1. **Async ingestion**: move parsing/insert into a BullMQ worker and poll `status` (the field already exists).
2. **OCR** for scanned PDFs (Tesseract/PaddleOCR) with per-page confidence.
3. **Auth + RBAC**: per-collection/document access filters. Weaviate multi-tenancy or filter-based ACLs both fit.
4. **Original-file storage** plus a document viewer that opens the cited page.
5. **Evaluation harness**: labelled query set to tune `alpha`, chunk size and embedding model (Recall@10 / nDCG@10, as in the proposal).
6. **Weaviate auth** (API key / OIDC) and backups before any shared deployment. Anonymous access is enabled for local use only.
7. Optional **reranker** module (`reranker-transformers`) on top of hybrid retrieval.
