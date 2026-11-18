export interface PageText {
  /** 1-based page number. Non-paginated formats use a single page 1. */
  page: number;
  text: string;
}

export interface Chunk {
  text: string;
  page: number;
  chunkIndex: number;
}

export interface ChunkOptions {
  /** Soft upper bound on chunk length, in characters. */
  maxChars: number;
  /** Characters carried over from the previous chunk on the same page. */
  overlapChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChars: 1000,
  overlapChars: 150,
};

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Structure-aware chunking: split each page on paragraph boundaries, pack
 * paragraphs into chunks up to `maxChars`, and split oversized paragraphs on
 * sentence boundaries (hard-splitting only as a last resort). Chunks never span
 * pages, so every passage keeps an exact page reference for traceability.
 */
export function chunkPages(
  pages: PageText[],
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Chunk[] {
  const { maxChars, overlapChars } = options;
  if (overlapChars >= maxChars) {
    throw new Error('overlapChars must be smaller than maxChars');
  }

  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const normalized = normalizeText(text);
    if (!normalized) continue;

    const pieces = normalized
      .split(/\n\s*\n/)
      .flatMap((para) => splitLong(para.replace(/\n/g, ' ').trim(), maxChars))
      .filter(Boolean);

    let current = '';
    const flush = () => {
      const body = current.trim();
      if (body) chunks.push({ text: body, page, chunkIndex: chunks.length });
      current = body ? tail(body, overlapChars) : '';
    };

    for (const piece of pieces) {
      const candidate = current ? `${current}\n\n${piece}` : piece;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }
      flush();
      current = current ? `${current} ${piece}` : piece;
      if (current.length > maxChars) current = piece;
    }

    // `current` always ends with a real piece here (flush is followed by an
    // append), so the remainder is never overlap-only.
    if (current.trim()) {
      chunks.push({ text: current.trim(), page, chunkIndex: chunks.length });
    }
  }

  return chunks;
}

function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph.match(
    /[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g,
  ) ?? [paragraph];
  const out: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length > maxChars) {
      if (buf) out.push(buf);
      buf = '';
      for (let i = 0; i < sentence.length; i += maxChars) {
        out.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = buf ? `${buf} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      out.push(buf);
      buf = sentence;
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Last `n` characters, trimmed forward to a word boundary. */
function tail(text: string, n: number): string {
  if (n <= 0 || text.length <= n) return n <= 0 ? '' : text;
  const slice = text.slice(-n);
  const firstSpace = slice.indexOf(' ');
  return firstSpace === -1 ? slice : slice.slice(firstSpace + 1);
}
