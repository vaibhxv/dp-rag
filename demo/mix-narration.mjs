// Lays the narration clips onto the edited video at the right moments.
//
// Each `say:<id>` mark is a time in the raw recording; make-video.sh trims the
// start and speeds up the ingestion wait, so marks are mapped to final-video
// time with the same cut points before the clips are delayed and mixed.
//
//   node demo/mix-narration.mjs <silent.mp4> <out.mp4>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [silent, out] = process.argv.slice(2);
const SPEED = Number(process.env.SPEED ?? 6);

const marks = JSON.parse(readFileSync(join(here, 'out', 'marks.json'), 'utf8'));
const at = (name) => marks.find((m) => m.name === name).t;
const B = Math.max(at('intro') - 0.3, 0);
const S = at('ingest-start') + 1.0;
const E = at('ingest-end') - 0.5;
const toFinal = (t) =>
  t < S ? Math.max(t - B, 0) : t < E ? S - B + (t - S) / SPEED : S - B + (E - S) / SPEED + (t - E);

const lines = marks
  .filter((m) => m.name.startsWith('say:'))
  .map((m) => ({ id: m.name.slice(4), start: toFinal(m.t) }));

const inputs = ['-i', silent];
const filters = [];
lines.forEach((l, i) => {
  inputs.push('-i', join(here, 'out', 'narration', `${l.id}.aiff`));
  const ms = Math.round(l.start * 1000);
  filters.push(`[${i + 1}:a]aresample=48000,adelay=${ms}:all=1[a${i}]`);
  console.log(`${l.start.toFixed(1).padStart(6)} s  ${l.id}`);
});
filters.push(
  `${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,` +
    'loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]'
);

execFileSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart',
    out,
  ],
  { stdio: 'inherit' }
);
