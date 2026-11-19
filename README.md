# Knowledge Retrieval Platform: RAG MVP

An MVP that shows the two core layers of the knowledge platform working end to end:

1. **Ingestion**: upload documents (including **scanned** PDFs). They are OCR'd where needed, chunked page by page, vectorized and stored in a vector DB.
2. **Retrieval / RAG**: search them with hybrid, semantic or keyword retrieval, and get an optional answer from a local LLM that uses only the retrieved passages and cites them.

**Demo video:** [`demo/rag-demo.mp4`](demo/rag-demo.mp4) (2 min). It ingests the three scanned Delhi Gazette notifications (`Sl. No. 06/07/08.pdf`), then answers questions from each one. The video is a real screen recording; only the OCR wait is sped up, and the video says so.

```
rag-proj/
├── api/                      NestJS backend (ingestion + retrieval layers)
├── ui/                       Next.js frontend (shadcn/ui components)
├── scripts/weaviate-native.sh  Runs Weaviate as a native binary (no Docker)
├── docker-compose.yml        Alternative: Weaviate + Ollama in Docker
├── demo/                     Demo recording script + rag-demo.mp4
└── *.docx / *.pdf            Original proposal + sample documents
```

---

## Decisions taken (and how they differ from the proposal)

The proposal document was an early draft. For this MVP we **replace** its stack choices as follows:

| Area | Proposal said | MVP decision | Why |
|---|---|---|---|
| Vector / search engine | OpenSearch (BM25 + vector) | **Self-hosted Weaviate 1.40** | One system covers storage, vectorization, BM25, hybrid fusion and RAG generation. That leaves fewer moving parts for an MVP. |
| Embedding model | BGE-M3 / multilingual E5, run by our own service | **Weaviate `text2vec-ollama`** with `paraphrase-multilingual` (562 MB) | Weaviate vectorizes on insert and at query time, so we don't run our own embedding pipeline. The model is multilingual, and a Hindi query correctly retrieves Hindi passages. It's small enough for an 8 GB laptop. |
| Answer generation | **None**: strictly non-generative, excerpts only | **RAG through Weaviate `generative-ollama`** with local `qwen2.5:1.5b`, temperature 0, **can be turned off per request** | The MVP has to show RAG working. The model runs locally (no external AI APIs). The prompt restricts it to the retrieved passages, and temperature 0 makes answers repeatable. Turn off "Generate answer" (or send `generate: false`) to get the excerpts-only behaviour the proposal described. |
| OCR | Tesseract / PaddleOCR | **tesseract.js (WASM), `eng+hin`**, applied automatically to PDF pages with no text layer | No system install needed and ~25 MB of language data. English is listed first because we measured that it keeps Latin digits correct ("1978", not "978"). Pages are rendered at 3× for OCR. |
| Backend | Python + FastAPI | **NestJS (TypeScript)** | One language across the monorepo. Uses the official `weaviate-client` v3 (gRPC). |
| Frontend | React + TypeScript | **Next.js 16 + shadcn/ui (Base UI)** | Ready-made accessible components, so we could build the demo UI quickly. |
| Metadata DB | PostgreSQL | **Not used**. Document metadata lives in a second Weaviate collection (`Document`) | Avoids running a second datastore for the MVP. Postgres comes back with users/RBAC/audit. |
| Background jobs | Celery + Redis | **None**. Ingestion runs synchronously inside the upload request (~4–5 s per scanned page) | Good enough for demo-sized files. A queue (e.g. `@nestjs/bullmq`) is the first step to scaling. |
| Original file storage | Object storage | **Not stored**. Only extracted text plus its SHA-256 | Out of MVP scope. |
| Office parsing | Apache Tika | `pdf-parse` (PDF, per page) and `mammoth` (DOCX). TXT/MD read directly | Pure-Node, no JVM. |
| Identity / RBAC | Keycloak | **None** (open demo) | Out of MVP scope. |
| Runtime | Docker | **Native binaries by default** (Weaviate binary + Homebrew Ollama). Docker Compose is also provided | Docker Desktop alone uses several GB, which is too much for an 8 GB / low-disk machine. |

### Things we kept from the proposal

- **Structure-aware chunking**: split on paragraphs, then sentences (including the Hindi danda `।`), and hard-split only as a last resort. Chunks are ~1000 chars with ~150 chars overlap. **Chunks never cross a page boundary**, so every passage has an exact page number.
- **Hybrid retrieval** (BM25 + vector) is the default. Weaviate's `relativeScoreFusion` combines the two, and `alpha` (0 = keyword, 1 = vector) can be changed in the UI.
- **Source traceability**: every passage returns its filename, page number, chunk index and an **OCR flag** (extraction-quality indicator). The document list shows how many pages were OCR'd.
- **No-result behaviour**: if no passages are retrieved, the UI says so, and the LLM is told to say the documents don't cover the question.
- **Integrity**: SHA-256 of each upload is stored and duplicate uploads are rejected.
- **No external AI APIs**: OCR, embeddings and the LLM all run locally.

### Model sizing (measured on an 8 GB M-series Mac)

| Role | Model | Disk | Notes |
|---|---|---|---|
| Embeddings | `paraphrase-multilingual` | 562 MB | Cross-lingual retrieval works: a Hindi query ranks the Hindi rate table #1. |
| LLM | `qwen2.5:1.5b` | 986 MB | Correct, grounded answers to English questions in 2–8 s. |
| LLM (rejected) | `qwen2.5:0.5b` | 397 MB | Fast, but gave wrong facts (wrong officer, mixed-up rates). |
| OCR | tesseract.js `eng+hin` | ~25 MB | Confidence 84–93% on the gazette scans, ~4–5 s per page. |
| Vector DB | Weaviate 1.40.5 binary | 390 MB | ~250 MB RAM at this data size. |

---

## Architecture

```
            ┌────────────┐  multipart upload   ┌──────────────────────────────────────────┐
            │  ui (Next) │ ──────────────────► │ api (Nest) :4000                         │
            │  :3000     │                     │  IngestionModule                         │
            │            │  POST /ask          │   parse → OCR scanned pages → chunk → SHA│
            │            │ ──────────────────► │  RetrievalModule                         │
            └────────────┘                     │   hybrid / nearText / bm25 [+ generate]  │
                                               └───────────────┬──────────────────────────┘
                                                               │ gRPC + REST (weaviate-client v3)
                                               ┌───────────────▼──────────────────────────┐
                                               │ Weaviate :8080 / :50051                  │
                                               │  Document       (metadata, no vectors)   │
                                               │  DocumentChunk  (text → vector + BM25)   │
                                               └───────┬───────────────────────┬──────────┘
                                          text2vec-ollama              generative-ollama
                                               ▼                               ▼
                                   ┌───────────────── Ollama :11434 ─────────────────┐
                                   │ paraphrase-multilingual        qwen2.5:1.5b     │
                                   └─────────────────────────────────────────────────┘
```

### Weaviate schema

- **`Document`**: `filename, mimeType, sizeBytes, sha256, pageCount, ocrPageCount, chunkCount, status (processing|ready|failed), error, uploadedAt`. No vectorizer.
- **`DocumentChunk`**: `text` (vectorized), `documentId`, `filename`, `page`, `chunkIndex`, `ocr`. Vectorizer: `text2vec-ollama` on `text` only. Generative: `generative-ollama`.

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

## Running it locally (native, no Docker; recommended for 8 GB machines)

**Prerequisites:** Node 22+, pnpm 10, Homebrew. About 2.5 GB of disk in total.

```bash
pnpm install

# 1. Ollama + the two models (~1.5 GB)
brew install ollama
ollama serve &                 # or: brew services start ollama
pnpm infra:models              # paraphrase-multilingual + qwen2.5:1.5b

# 2. Weaviate (downloads and checksum-verifies the binary into .local/ on first run)
pnpm infra:native              # leave running; data persists in .local/weaviate-data

# 3. Configure (defaults work as-is for the native setup)
cp api/.env.example api/.env
cp ui/.env.example  ui/.env.local

# 4. API (:4000) + UI (:3000)
pnpm dev
```

Open http://localhost:3000, upload PDFs on the **Ingest** tab, then ask questions on the **Search** tab.

To use **Docker** instead, run `docker compose up -d` and set `OLLAMA_ENDPOINT=http://ollama:11434` in `api/.env`.

Notes:
- `OLLAMA_ENDPOINT` is called **by Weaviate**, not by the API, so it must be reachable from wherever Weaviate runs.
- `OLLAMA_ENDPOINT`, `OLLAMA_EMBED_MODEL` and `OLLAMA_MODEL` are written into the `DocumentChunk` collection config when it is first created. If you change them later, run `curl -X DELETE localhost:8080/v1/schema/DocumentChunk`, restart the API and re-ingest.
- The native script raises Weaviate's disk thresholds (read-only at 98% instead of 90%) because dev laptops are often fuller than 90%. Keep the defaults on servers.

### Quick API test

```bash
curl -F "files=@Sl. No. 06.pdf" http://localhost:4000/documents
curl -s -X POST http://localhost:4000/ask -H 'Content-Type: application/json' \
  -d '{"query":"What is the charge for deploying a Sub-Inspector of police?"}' | jq .answer
# "The charge for deploying a Sub-Inspector of police is Rs. 5739/- per day for five hours."
```

### Tests

```bash
pnpm test          # chunker unit tests (api)
pnpm build         # type-checks and builds api + ui
```

### Re-recording the demo

With everything running and an empty knowledge base:

```bash
node demo/record-demo.mjs "Sl. No. 06.pdf" "Sl. No. 07.pdf" "Sl. No. 08.pdf"
./demo/make-video.sh     # → demo/rag-demo.mp4 (needs ffmpeg)
```

The script drives your installed Chrome via `playwright-core`, so no browser download is needed.

---

## Known MVP limitations / next steps

1. **Hindi answer generation is weak with the 1.5B model.** Hindi *retrieval* works well, but the generated answer may switch to English or mistranslate ranks. That's why the demo shows the Hindi query in retrieval-only mode. `qwen2.5:3b` (~1.9 GB) or larger should fix this if RAM allows.
2. **Small-model leakage.** For questions the documents don't cover, a 1.5B model sometimes answers from general knowledge despite the prompt. The cited passages make this visible, and a larger model or a relevance threshold before generation would reduce it.
3. **Async ingestion**: move parsing/OCR/insert into a BullMQ worker and poll `status` (the field already exists).
4. **OCR quality**: per-page confidence is logged but not yet stored or shown. Low-confidence pages should be flagged for review.
5. **Auth + RBAC**: per-collection/document access filters. Weaviate multi-tenancy or filter-based ACLs both fit.
6. **Original-file storage** plus a document viewer that opens the cited page.
7. **Evaluation harness**: labelled query set to tune `alpha`, chunk size and models (Recall@10 / nDCG@10, as in the proposal).
8. **Weaviate auth** (API key / OIDC) and backups before any shared deployment. Anonymous access is enabled for local use only.
