import { existsSync } from 'node:fs';

/**
 * Loads `.env` before any other module is evaluated. Several modules read
 * settings at import time (OCR_ENGINE, MIN_RERANK_SCORE, CHAT_PASSAGES, ...),
 * which happens before ConfigModule.forRoot() runs, so without this they
 * silently fell back to their defaults. Must be the first import of main.ts.
 * Variables already set in the environment win over the file.
 */
if (existsSync('.env')) {
  const before = { ...process.env };
  process.loadEnvFile('.env');
  Object.assign(process.env, before);
}
