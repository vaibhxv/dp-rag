import type { OllamaService } from '../ollama/ollama.service.js';
import { CATEGORIES, type Category } from '../store/store.service.js';

export interface DocumentDescription {
  title: string;
  summary: string;
  category: Category;
  questions: string[];
}

/** How much text (from the start of the document) the model sees. */
const MAX_INPUT_CHARS = 3000;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    category: { type: 'string', enum: [...CATEGORIES] },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'category', 'questions'],
};

/**
 * Uses the local LLM to give a document a readable title, one-line summary,
 * a library category and two example questions (used as chat suggestions).
 * Never fails ingestion: falls back to the filename on any error.
 */
export async function describeDocument(
  ollama: OllamaService,
  filename: string,
  text: string,
): Promise<DocumentDescription> {
  const fallback: DocumentDescription = {
    title: filename.replace(/\.[^.]+$/, ''),
    summary: '',
    category: 'Other',
    questions: [],
  };
  const excerpt = pickExcerpt(text);
  if (excerpt.length < 40) return fallback;

  try {
    const raw = await ollama.complete(
      [
        {
          role: 'system',
          content:
            'You catalogue official government and police documents. Reply in English with JSON only.',
        },
        {
          role: 'user',
          content: [
            `File name: ${filename}`,
            'Document text (may be OCR of a scan, possibly Hindi and English):',
            '"""',
            excerpt,
            '"""',
            '',
            'Return JSON with:',
            '- "title": the subject of the document in at most 12 words, in English (not the file name, no reference numbers).',
            '- "summary": one sentence (max 30 words) saying what the document decides or instructs.',
            `- "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(', ')}.`,
            '- "questions": 2 short questions in English that a police officer could ask and this document answers. Each must name a concrete subject from the text (a rank, rule, form, amount, officer, procedure). Never write "the document" or "this notification". Do not ask about the title, number or date of the document itself.',
          ].join('\n'),
        },
      ],
      { format: SCHEMA, temperature: 0, numCtx: 4096 },
    );
    const parsed = JSON.parse(raw) as Partial<DocumentDescription>;
    const clean = (s: unknown, max: number) =>
      typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
    const category = CATEGORIES.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : 'Other';
    return {
      title: clean(parsed.title, 140) || fallback.title,
      summary: clean(parsed.summary, 300),
      category,
      questions: Array.isArray(parsed.questions)
        ? parsed.questions
            .map((q) => clean(q, 160))
            .filter(
              (q) =>
                q.length > 12 &&
                q.endsWith('?') &&
                !/\b(this|the) (document|notification|circular|order|text|gazette)\b|purpose of|short title|title of|what is the name of/i.test(q),
            )
            .slice(0, 2)
        : [],
    };
  } catch {
    return fallback;
  }
}

/** Gazette mastheads and registration lines that say nothing about the subject. */
const BOILERPLATE =
  /REGD\.? No|EXTRAORDINARY|PUBLISHED BY AUTHORITY|PART II|Section 3|CG-DL|GIDHxxx|GIDExxx|^No\. \d+\]/i;

/**
 * Bilingual gazettes often carry Hindi first in a broken legacy font encoding
 * and the English version after it. A 1.5B model summarises the English far
 * better, so prefer English lines when there are enough of them.
 */
export function pickExcerpt(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !BOILERPLATE.test(l));
  const latinRatio = (l: string) =>
    (l.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(1, l.replace(/[\s\d\p{P}]/gu, '').length);
  const english = lines.filter((l) => latinRatio(l) > 0.7).join(' ');
  const chosen = english.length >= 400 ? english : lines.join(' ');
  return chosen.slice(0, MAX_INPUT_CHARS);
}
