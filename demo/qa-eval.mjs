// Answer-quality test against the running API (/chat), on the 25 sample documents.
//
//   node demo/qa-eval.mjs [apiUrl] [label]
//
// Each case: question, a regex the answer must match (and optionally one it
// must not), and the file the answer must be grounded in. "Cited" means the
// [n] markers in the answer point at that file. Expected answers were checked
// against the page text of the documents.
const API = process.argv[2] ?? 'http://localhost:4000';
const LABEL = process.argv[3] ?? '';
const NOT_COVERED = /do not cover|not covered|नहीं/i;

const CASES = [
  ['Within how many days must an e-FIR be signed by the informant?', /three|\b3\b/i, 'Zero FIR'],
  ['Who must approve the arrest of a woman after sunset?', /magistrate/i, 'L&O-70'],
  ['Whose permission is needed to arrest a person above 60 years of age for an offence punishable with less than 3 years?', /ACP|Assistant Commissioner|Deputy Superintendent/i, 'L&O-70'],
  ['What is the charge for deploying a Head Constable?', /4232/, 'Sl. No. 06'],
  ['What is the charge for deploying a Sub-Inspector?', /5739/, 'Sl. No. 06', /4783/],
  ['What is the charge for deploying a Constable?', /3658/, 'Sl. No. 06'],
  ['By how much do the police deployment charges increase every year?', /3\s?%|3 per ?cent|three per ?cent/i, 'Sl. No. 06'],
  ['When did the Bharatiya Nyaya Sanhita come into force?', /1(st)?( day of)? July,? 2024|01\.07\.2024/i, 'GOI Sr. No 02'],
  ['When does the Bharatiya Sakshya Adhiniyam come into force?', /July,? 2024/i, 'GOI Sr. No. 03'],
  ['For which offences must a forensic expert visit the crime scene?', /seven years|7 years/i, 'Sl. No. 14'],
  ['Who must cause the forensic expert to visit the crime scene?', /officer[- ]in[- ]charge|in-charge of (a|the) police station/i, 'Sl. No. 14', /Lieutenant Governor/i],
  ['How many digits does the SID of an eSakshya packet have?', /16|sixteen/i, 'Sl. No. 22'],
  ['Which agency is the nodal agency for Section 79(3)(b) of the IT Act in Delhi?', /Delhi Police/i, 'Sl. No. 08'],
  ['Who should disseminate information to the media on law and order incidents?', /designated officer/i, 'Guidelines for Social Media'],
  ['Up to what percentage can the purchaser increase the ordered quantity under the bid corrigendum?', /25/, 'corrigendum'],
  ['Who will exercise the powers under the Unlawful Activities (Prevention) Act regarding Sikhs For Justice in Delhi?', /Commissioner of Police/i, 'Sl. No. 07'],
  ['Can an FIR be registered irrespective of jurisdiction?', /yes|zero fir|irrespective|regardless/i, 'Zero FIR'],
  ['e-FIR par shikayatkarta ko kitne din mein sign karna hota hai?', /\b3\b|teen|three|तीन/i, 'Zero FIR'],
  ['ई-एफआईआर पर सूचनाकर्ता को कितने दिनों के भीतर हस्ताक्षर करने होते हैं?', /\b3\b|तीन|three/i, 'Zero FIR'],
  ['भारतीय न्याय संहिता कब से लागू हुई?', /2024/, 'GOI Sr. No 02'],
  ['60 saal se upar ke vyakti ko giraftar karne ke liye kiski permission chahiye?', /ACP|Assistant Commissioner|सहायक पुलिस आयुक्त|Deputy Superintendent/i, 'L&O-70'],
  ['हेड कांस्टेबल की तैनाती का शुल्क कितना है?', /4232|४२३२/, 'Sl. No. 06'],
  ['What is the capital of France?', null, null],
  ['How do I renew my Indian passport?', null, null],
  ['Who won the cricket world cup in 2011?', null, null],
  ['What is the punishment for theft under IPC?', null, null],
];

async function ask(q) {
  const t = Date.now();
  const r = await fetch(`${API}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({ messages: [{ role: 'user', parts: [{ type: 'text', text: q }] }] }),
  });
  let text = '', sources = null;
  for (const line of (await r.text()).split('\n')) {
    if (!line.startsWith('data: {')) continue;
    const c = JSON.parse(line.slice(6));
    if (c.type === 'text-delta') text += c.delta;
    if (c.type === 'data-sources') sources = c.data;
    if (c.type === 'error') text += ` [ERROR ${c.errorText}]`;
  }
  return { text: text.trim(), sources, ms: Date.now() - t };
}

let correct = 0, grounded = 0, cited = 0, answerable = 0, refused = 0, unanswerable = 0, totalMs = 0;
const rows = [];
for (const [q, expect, file, forbid] of CASES) {
  const { text, sources, ms } = await ask(q);
  totalMs += ms;
  const files = (sources?.passages ?? []).map((p) => p.filename);
  let ok, src = '', cit = '';
  if (!expect) {
    unanswerable++;
    ok = NOT_COVERED.test(text) && text.length < 120;
    if (ok) refused++;
  } else {
    answerable++;
    ok = expect.test(text) && !(forbid && forbid.test(text));
    const inSources = files.some((f) => f.includes(file));
    // Same citation syntax the UI renders: [1] or [1, 2].
    const nums = [...text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)].flatMap((m) => m[1].split(',').map((n) => Number(n) - 1));
    const citedOk = nums.length > 0 && nums.every((n) => files[n]?.includes(file));
    if (ok) correct++;
    if (inSources) grounded++;
    if (ok && citedOk) cited++;
    src = inSources ? 'src✓' : 'src✗';
    cit = citedOk ? 'cite✓' : 'cite✗';
  }
  const rel = sources?.relevance != null ? ` rel=${Number(sources.relevance).toFixed(4)}` : '';
  rows.push(`${ok ? 'PASS' : 'FAIL'} ${src} ${cit} ${(ms / 1000).toFixed(1)}s${rel} | ${q}\n      → ${text.replace(/\s+/g, ' ').slice(0, 220)}`);
}
console.log(rows.join('\n'));
console.log(`\n${LABEL} SUMMARY`);
console.log(`  correct answers:         ${correct}/${answerable}`);
console.log(`  correct + cited source:  ${cited}/${answerable}`);
console.log(`  right doc retrieved:     ${grounded}/${answerable}`);
console.log(`  refused out-of-scope:    ${refused}/${unanswerable}`);
console.log(`  mean time per answer:    ${(totalMs / CASES.length / 1000).toFixed(1)} s`);
