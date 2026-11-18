import { chunkPages, normalizeText } from './chunker.js';

describe('normalizeText', () => {
  it('collapses whitespace and excess blank lines', () => {
    expect(normalizeText('a  \t b\r\n\r\n\r\n\r\nc  ')).toBe('a b\n\nc');
  });
});

describe('chunkPages', () => {
  const opts = { maxChars: 100, overlapChars: 20 };

  it('keeps small pages as a single chunk with the right page number', () => {
    const chunks = chunkPages(
      [
        { page: 1, text: 'First page.' },
        { page: 2, text: 'Second page.' },
      ],
      opts,
    );
    expect(chunks).toEqual([
      { text: 'First page.', page: 1, chunkIndex: 0 },
      { text: 'Second page.', page: 2, chunkIndex: 1 },
    ]);
  });

  it('skips empty pages', () => {
    expect(chunkPages([{ page: 1, text: '  \n ' }], opts)).toEqual([]);
  });

  it('never exceeds maxChars and never spans pages', () => {
    const para = 'Lorem ipsum dolor sit amet consectetur. '.repeat(12);
    const chunks = chunkPages(
      [
        { page: 3, text: `${para}\n\n${para}` },
        { page: 4, text: para },
      ],
      opts,
    );
    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(opts.maxChars);
      expect([3, 4]).toContain(c.page);
    }
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it('packs paragraphs together and carries overlap into the next chunk', () => {
    const chunks = chunkPages(
      [
        {
          page: 1,
          text: 'Alpha paragraph here.\n\nBeta paragraph here.\n\nGamma paragraph that is a little longer so it overflows the limit.',
        },
      ],
      opts,
    );
    expect(chunks[0].text).toContain('Alpha');
    expect(chunks[0].text).toContain('Beta');
    expect(chunks[1].text).toContain('Gamma');
    // overlap: tail of chunk 0 reappears at the start of chunk 1
    expect(chunks[1].text.startsWith('paragraph here.')).toBe(true);
  });

  it('hard-splits a single sentence longer than maxChars', () => {
    const chunks = chunkPages([{ page: 1, text: 'x'.repeat(250) }], opts);
    expect(chunks.every((c) => c.text.length <= opts.maxChars)).toBe(true);
    expect(chunks.map((c) => c.text).join('')).toContain('x'.repeat(100));
  });

  it('splits on the Devanagari danda for Hindi text', () => {
    const hindi = 'यह एक वाक्य है। '.repeat(20);
    const chunks = chunkPages([{ page: 1, text: hindi }], opts);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= opts.maxChars)).toBe(true);
  });
});
