import { describe, expect, it } from 'vitest';
import { looksLooped } from './ocr.js';
import { needsOcr } from './parser.js';

describe('needsOcr', () => {
  it('flags pages with no text layer', () => {
    expect(needsOcr('')).toBe(true);
    expect(needsOcr('  12  \n')).toBe(true);
  });

  it('keeps a good English text layer', () => {
    expect(needsOcr('The Bharatiya Nyaya Sanhita, 2023 shall come into force on 1 July 2024.')).toBe(false);
  });

  it('keeps a good Hindi text layer', () => {
    const hindi = 'भारत का राजपत्र असाधारण। केंद्रीय सरकार एतद्द्वारा अधिसूचित करती है कि भारतीय न्याय संहिता लागू होगी।';
    expect(needsOcr(hindi.repeat(2))).toBe(false);
  });

  it('flags a Hindi text layer with broken glyph mapping', () => {
    // Real extraction from GOI Sr. No. 05.pdf ("राजपत्र" came out as "रािपत्र").
    const broken =
      'सुरक्षा; गविेशों के साथ मैत्रीपूर्ा संबंधों; लोक-व्यवस्था; गशष्टर्ता या नैगर्तकर्ता; भारत का रािपत्र : असाधारण; संबंजधत र्तत्समय प्रवृत्त दकसी गवगध के अधीन प्रगर्तगिद्ध िै';
    expect(needsOcr(broken)).toBe(true);
  });

  it('flags text made of unmapped private-use glyphs', () => {
    expect(needsOcr(''.repeat(20) + 'abc')).toBe(true);
  });
});

describe('looksLooped', () => {
  it('detects a repetition loop', () => {
    const looped = ['Header line', ...Array(30).fill('| 1 | Constable | Rs. 3658 |')].join('\n');
    expect(looksLooped(looped)).toBe(true);
  });

  it('accepts normal page text', () => {
    const page = Array.from({ length: 30 }, (_, i) => `${i + 1}. Rule number ${i + 1} applies here.`).join('\n');
    expect(looksLooped(page)).toBe(false);
  });
});
