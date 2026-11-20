import { describeDocument, pickExcerpt } from './describe.js';
import type { OllamaService } from '../ollama/ollama.service.js';

const fakeOllama = (reply: string) =>
  ({ complete: () => Promise.resolve(reply) }) as unknown as OllamaService;

describe('pickExcerpt', () => {
  it('prefers English lines in a bilingual gazette and drops the masthead', () => {
    const hindi = 'सूचना प्रौद्योगिकी मंत्रालय अधिसूचना नई दिल्ली\n'.repeat(20);
    const english =
      'The Central Government hereby makes the following rules further to amend the Information Technology Rules, 2021.\n'.repeat(5);
    const text = `REGD. No. D. L.-33004/99\nEXTRAORDINARY\n${hindi}${english}`;
    const out = pickExcerpt(text);
    expect(out).toContain('Central Government hereby makes');
    expect(out).not.toMatch(/EXTRAORDINARY|REGD/);
    expect(out).not.toMatch(/[ऀ-ॿ]/);
  });

  it('keeps Hindi when there is not enough English', () => {
    const out = pickExcerpt('पुलिस की अतिरिक्त तैनाती\nसिपाही का प्रभार 3658 रुपये');
    expect(out).toContain('सिपाही');
  });
});

describe('describeDocument', () => {
  const text = 'The charges for deployment of additional police shall be as under. '.repeat(5);

  it('cleans the model output and drops vague questions', async () => {
    const reply = JSON.stringify({
      title: '  Police   Deployment Charges ',
      summary: 'Sets the charges.',
      category: 'Notification',
      questions: [
        'What is the purpose of this document?',
        'What is the short title of the rules?',
        'What is the charge for deploying a Head Constable?',
      ],
    });
    const d = await describeDocument(fakeOllama(reply), 'Sl. No. 06.pdf', text);
    expect(d.title).toBe('Police Deployment Charges');
    expect(d.category).toBe('Notification');
    expect(d.questions).toEqual(['What is the charge for deploying a Head Constable?']);
  });

  it('falls back to the filename on bad JSON or unknown category', async () => {
    const d = await describeDocument(fakeOllama('not json'), 'Sl. No. 06.pdf', text);
    expect(d).toMatchObject({ title: 'Sl. No. 06', category: 'Other', questions: [] });
    const e = await describeDocument(
      fakeOllama(JSON.stringify({ title: 'X', summary: '', category: 'Memo', questions: [] })),
      'a.pdf',
      text,
    );
    expect(e.category).toBe('Other');
  });
});
