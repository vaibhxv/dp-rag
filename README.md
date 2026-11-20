# Sahayak: knowledge assistant (RAG MVP)

A chat-first assistant over official documents (orders, circulars, gazette notifications), including **scanned** PDFs. Ask a question in the chat and get a short answer, a citation chip for each fact, and one click to the exact page, shown as extracted text with the passage highlighted or as the original scan.

**Demo video:** [`demo/rag-demo.mp4`](demo/rag-demo.mp4) (3¼ min, with a Hinglish voice-over). It is a real recording of the app. Only the ingestion wait is sped up, and the caption says so.

**Design — "Gazette Modern"** (light only): porcelain-white surfaces, Delhi Police navy for ink and actions, marigold-gold for highlights and citation seals (all taken from the emblem), a newspaper-style serif (Newsreader) for headings to echo the official gazettes, Inter for the interface and Noto Sans Devanagari for Hindi. The design canvas (chat, welcome, library, ingest, phone) is a private Artifact: https://claude.ai/artifact/QxyZnhre7yWVkgqvpnn3Sb.

```
rag-proj/
├── api/                        NestJS: ingestion queue, SQLite store, retrieval, streaming chat
├── ui/                         Next.js 16 + shadcn/ui (Base UI) + Vercel AI SDK chat
├── docs/                       The 25 sample documents
├── scripts/weaviate-native.sh  Runs Weaviate as a native binary (no Docker)
├── docker-compose.yml          Alternative: Weaviate + Ollama in Docker
└── demo/                       Recording script + make-video.sh + rag-demo.mp4
```

---

## What the app does

| Area | Feature |
|---|---|
| **Sidebar** (collapsible to an icon rail; a drawer on phones) | Emblem + name · New chat · **Ingest** · Ask · Library · **Collections** (one click filters the library by category) · conversations grouped Today / Earlier · a live **ingestion card** (progress ring, current file and step) · service status |
| **Chat** | Streaming answers from a local LLM. Each fact gets a **citation seal**: hover previews the passage, click opens the page. Key figures (amounts, dates) are underlined like a highlighter pen. Under each answer is an **evidence slip** quoting the exact line from the page that supports it (picked by matching the answer's figures and words). Also: "Searching / Writing from 3 passages" status, suggested follow-ups from the cited document, Jump to latest, stop, regenerate, copy, Useful / Not useful, a scope picker (all documents or one), and conversation context for follow-up questions. |
| **Grounding** | Answers come only from retrieved passages. A **relevance gate** skips the LLM when nothing relevant was found and replies "The uploaded documents do not cover this." The closest passages are still shown, labelled as not relevant enough. |
| **Add to the library** | Drag & drop several PDF/DOCX/TXT/MD files. Upload returns immediately and ingestion runs **in the background**. Each file shows a four-stage bar (Store → Read/OCR → Understand → Index) with the live step ("OCR page 3 of 12"). Duplicates (same SHA-256) show "Already in the library as …" with a link to the existing document. |
| **Library** | A full view with cards showing **real page thumbnails** (rendered from page 1, cached in SQLite), a colour band per category, OCR / Digital and New badges, the AI summary, and live progress for files being ingested. Search over titles, files and summaries. Filters: category and Scanned. |
| **Document panel** | Breadcrumb into the library, serif title, category, file, OCR confidence and the AI summary. **Text** shows each page set as paper, scrolled to the cited page with the passage lightly shaded and the answering line marked in amber. Page thumbnails sit at the bottom. **Original scan** is rendered in the app with pdf.js, opened at the cited page. **Ask this document** limits chat to that file. Also: open, download, delete, expand, close. Full screen on phones. |
| **Suggestions** | "Try one of these" questions are generated from each document at ingestion, so they change with the library. |

### Improvements over the reference tool

- **Ingestion is in the product.** Upload, OCR scanned pages and index them, with progress you can watch. The reference only browses a fixed corpus.
- **The original file is stored and viewable** from a local database (SQLite), with no external file server. pdf.js renders it, so it also works in browsers without a PDF plugin.
- **Click-through citations**: a chip on each fact, a hover preview, and a highlighted passage at the right page in the text view.
- **"Ask this document"** scoping, follow-up questions, and conversation history.
- **Honest "not covered"**: a measured relevance gate instead of trusting the model.
- **Light only**, as requested. One blue accent and soft status colours.

---

## Decisions (and how they differ from the original proposal)

| Area | Proposal said | MVP decision | Why |
|---|---|---|---|
| Vector / search engine | OpenSearch | **Self-hosted Weaviate 1.40** (native binary) | One system for vectors, BM25 and hybrid fusion. |
| Embeddings | BGE-M3 / E5 via own service | **Weaviate `text2vec-ollama`** + `paraphrase-multilingual` (562 MB) | Weaviate vectorizes on insert and at query time. The model is multilingual: a Hindi query ranks the Hindi rate table first. |
| Answer generation | None (excerpts only) | **Local `qwen2.5:1.5b` via Ollama, streamed**, temperature 0 | The chat needs token streaming, so `/chat` calls Ollama directly after Weaviate retrieval. `/ask` still uses Weaviate's `generative-ollama` for the non-streaming API. No external AI APIs. |
| Chat UI | n/a | **Vercel AI SDK (`useChat`) + `use-stick-to-bottom`** on shadcn components | A proven chat state/streaming library. The API speaks its UI-message-stream protocol (SSE) directly, so there's no adapter. |
| Metadata DB + file storage | PostgreSQL + object storage | **SQLite (`node:sqlite`, built into Node)**: documents, **original files (BLOB)**, extracted page text | Zero install and one file (`api/data/knowledge.db`). Weaviate keeps only the searchable chunks. Postgres + object storage are the path to multi-user. |
| Background jobs | Celery + Redis | **In-process serial queue**, resumed on restart | OCR and the LLM are CPU-heavy on a laptop, so one document at a time. Unfinished documents are picked up again when the API boots. |
| OCR | Tesseract / PaddleOCR | **tesseract.js (WASM), `eng+hin`**, only on pages without a text layer, rendered at 3× | No system install. English first keeps Latin digits right. Per-page confidence is stored and shown. |
| Document titles / categories | Manual | **Generated at ingestion** by the local LLM (JSON schema output), from English lines of bilingual gazettes when available | Makes the library browsable without manual cataloguing. Can be regenerated with `POST /documents/:id/describe`. |
| Backend / frontend | FastAPI / React | **NestJS / Next.js 16** | One language across the monorepo. |
| Identity / RBAC | Keycloak | None (open demo) | Out of MVP scope. |

### Retrieval and grounding (measured on the 25 sample documents)

- **Chunking**: paragraphs → sentences (including the Hindi `।`), ~1000 chars with 150 overlap. Chunks never cross pages, so every citation has an exact page.
- **Hybrid search** (BM25 + vector, `relativeScoreFusion`, α = 0.5). The **top 3** passages go to the LLM; 3 measured better than 5 with a 1.5B model because fewer look-alike lines confuse it less.
- **Relevance gate** (`MIN_RELEVANCE=0.5`, best-passage cosine similarity): in-scope questions scored 0.54–0.75, clearly off-topic ones 0.21–0.49 (e.g. "punishment for theft under IPC" 0.49, "capital of France" 0.21). Near-domain questions such as "punishment for murder" (0.54) still pass the gate.

### Model sizing (8 GB M-series Mac)

| Role | Model | Disk | Notes |
|---|---|---|---|
| Embeddings | `paraphrase-multilingual` | 562 MB | Hindi ↔ English retrieval works. |
| LLM | `qwen2.5:1.5b` | 986 MB | 2–6 s per answer, streamed. |
| LLM (tried, removed) | `qwen2.5:3b` | 1.9 GB | Fixed one rate question but got another wrong, produced garbage in Hindi, was 3–5× slower, and pushed the machine into heavy swapping. |
| LLM (tried, removed) | `qwen2.5:0.5b` | 397 MB | Wrong facts. |
| OCR | tesseract.js `eng+hin` | ~25 MB | 84–93% confidence on the gazette scans, ~4–5 s per page. |
| Vector DB | Weaviate 1.40.5 | 390 MB | ~250 MB RAM. |

---

## Architecture

```
 ui (Next.js :3000)                         api (NestJS :4000)
 ┌──────────────────────────┐   POST /chat (SSE, AI SDK protocol)   ┌──────────────────────────────────────────┐
 │ Sidebar · Chat (useChat) │ ────────────────────────────────────► │ ChatService                               │
 │ Library · Document panel │   /documents, /documents/:id/file     │  hybrid search ─► gate ─► Ollama stream   │
 │ Ingest dialog · pdf.js   │ ────────────────────────────────────► │ IngestionService (background queue)       │
 └──────────────────────────┘                                       │  parse/OCR ─► describe (LLM) ─► chunk     │
                                                                    └──────┬──────────────┬────────────┬────────┘
                                                        SQLite (node:sqlite)│   Weaviate   │   Ollama   │
                                                  documents · files (BLOB)  │ DocumentChunk│ qwen2.5:1.5b
                                                  · pages (extracted text)  │ text→vector  │ paraphrase-
                                                                            │ + BM25       │ multilingual
```

### API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Weaviate + Ollama status, model, library stats |
| `POST` | `/documents` | `multipart/form-data`, field `files` (up to 50, 25 MB each). Stores and queues each file and returns immediately. |
| `GET` | `/documents` | All documents with status / progress / title / summary / category / questions |
| `GET` | `/documents/:id` | One document |
| `GET` | `/documents/:id/pages` | Extracted text per page (+ OCR flag and confidence) |
| `GET` | `/documents/:id/file` | The original file (inline) |
| `GET` | `/documents/:id/thumbnail` | Page-1 PNG for library cards (rendered on first request, cached in SQLite) |
| `POST` | `/documents/:id/describe` | Regenerate title / summary / category / questions |
| `DELETE` | `/documents/:id` | Delete a document, its file, its pages and its chunks |
| `POST` | `/chat` | Streaming RAG chat. Body: AI SDK `{ messages }`, plus optional `documentId`, `mode`. Streams `data-sources`, text deltas and `data-meta`. |
| `POST` | `/search` | Retrieval only: `{ query, mode?, alpha?, limit?, documentId? }` |
| `POST` | `/ask` | Non-streaming RAG via Weaviate `generative-ollama` |

---

## Running it locally (native, no Docker)

**Prerequisites:** Node 22.5+ (for `node:sqlite`; tested on 26), pnpm 10, Homebrew. ~2.5 GB of disk.

```bash
pnpm install

# 1. Ollama + models (~1.5 GB)
brew install ollama
ollama serve &
pnpm infra:models              # paraphrase-multilingual + qwen2.5:1.5b

# 2. Weaviate (downloads and checksum-verifies the binary into .local/ on first run)
pnpm infra:native              # leave running

# 3. Config (defaults work as-is)
cp api/.env.example api/.env
cp ui/.env.example  ui/.env.local

# 4. API (:4000) + UI (:3000)
pnpm dev
```

Open http://localhost:3000 and click **Ingest documents** in the sidebar. Ingesting all of `docs/` (25 files, 187 pages, ~150 of them scanned) takes about 15 minutes on a laptop, and you can chat while it runs.

To use **Docker** instead, run `docker compose up -d` and set `OLLAMA_ENDPOINT=http://ollama:11434` in `api/.env` (Weaviate calls Ollama inside the Docker network). The API keeps using `OLLAMA_API_ENDPOINT=http://localhost:11434`.

Notes:
- `OLLAMA_ENDPOINT` is the address **Weaviate** uses for embeddings. `OLLAMA_API_ENDPOINT` (defaults to `OLLAMA_ENDPOINT`) is the address the **API** uses for chat and descriptions. They differ only when Weaviate runs in Docker.
- The `DocumentChunk` collection config (embedding model, endpoint) is fixed when it is created. To change it, delete the collection (`curl -X DELETE localhost:8080/v1/schema/DocumentChunk`) and re-ingest.
- The native Weaviate script raises the disk read-only threshold to 98% because dev laptops are often more than 90% full.
- Reset everything: stop the API, delete `api/data/` and the `DocumentChunk` collection.

### Tests

```bash
pnpm test     # chunker + document-description unit tests (api)
pnpm build    # type-checks and builds api + ui
```

### Re-recording the demo

With everything running (UI as a production build: `pnpm --filter ui build && pnpm --filter ui start`) and every document ingested **except** the two passed to the script:

```bash
node demo/make-narration.mjs  # Hinglish voice-over clips (macOS `say`, voice "Lekha", offline)
node demo/record-demo.mjs "docs/Sl. No. 07.pdf" "docs/Sl. No. 08.pdf"
./demo/make-video.sh          # → demo/rag-demo.mp4 with narration (needs ffmpeg)
```

The narration script lives in `demo/narration.mjs`: each step has an English on-screen caption and a Hinglish line written in Devanagari, with English terms spelled as spoken (लाइब्रेरी, डॉक्यूमेंट) so the Hindi voice pronounces them naturally. The recording waits for each line to finish before moving on, and `mix-narration.mjs` places every clip at its caption's time in the final cut (accounting for the trimmed start and the 6× sped-up ingestion).

---

## Known limitations / next steps

1. **The 1.5B model still makes mistakes on look-alike lines.** Asked for the *Sub-Inspector* rate, it answered with the *Assistant Sub-Inspector* line next to it (Rs. 4783 instead of 5739). Asked who sends the forensic expert, it named the Lieutenant Governor (who signed the notification) instead of the officer in charge of the police station. The citation chip makes these checkable in one click. A 7B-class model on a server is the real fix; on this laptop the 3B model did not help overall.
2. **Similar names can get mixed up.** Asked when the Bharatiya *Nagarik Suraksha* Sanhita came into force, it answered from the Bharatiya *Nyaya* Sanhita notification. Both date from 1 July 2024, but the citation was the wrong law. The evidence slip shows the quoted line, so this is visible. The demo asks about the Nyaya Sanhita, which that page does answer.
3. **Hindi answer generation is weak.** Hindi *retrieval* works (the right Hindi page ranks first), but the 1.5B model's Hindi answers are unreliable, which is why the demo uses English questions.
4. **Near-domain questions** can pass the relevance gate (see the numbers above). The prompt then has to refuse, and a 1.5B model sometimes doesn't.
5. **Generated suggestions and titles** come from a small model. Some are vague and are filtered out in the UI, and they can be regenerated per document.
6. Conversation history and feedback live in the browser only. Next would be server-side storage and an evaluation set built from the 👍/👎 feedback.
7. Auth/RBAC, Weaviate auth and backups before any shared deployment. Postgres + object storage instead of SQLite for multiple users.
