import { describe, expect, it } from 'vitest';
import { isRomanHindi } from './chat.service.js';

describe('isRomanHindi', () => {
  it('detects Hinglish questions', () => {
    expect(isRomanHindi('e-FIR par shikayatkarta ko kitne din mein sign karna hota hai?')).toBe(true);
    expect(isRomanHindi('60 saal se upar ke vyakti ko giraftar karne ke liye kiski permission chahiye?')).toBe(true);
    expect(isRomanHindi('Zero FIR kya hai?')).toBe(true);
    expect(isRomanHindi('Zero FIR hai')).toBe(false); // one marker word: too little evidence
  });

  it('leaves English and Devanagari alone', () => {
    for (const q of [
      'What is the charge for deploying a Constable?',
      'Who must approve the arrest of a woman after sunset?',
      'Can you tell me who signs the e-FIR?',
      'Who won the cricket world cup in 2011?',
      'भारतीय न्याय संहिता कब से लागू हुई?',
    ]) {
      expect(isRomanHindi(q)).toBe(false);
    }
  });
});
