// Generates one audio clip per narration line with macOS `say` (offline) and
// records their durations, which record-demo.mjs uses to pace the recording.
//
//   node demo/make-narration.mjs   ->  demo/out/narration/<id>.aiff + durations.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES, RATE, VOICE } from './narration.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'out', 'narration');
mkdirSync(dir, { recursive: true });

const durations = {};
for (const [id, line] of Object.entries(LINES)) {
  const file = join(dir, `${id}.aiff`);
  execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', file, line.say]);
  const d = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]).toString();
  durations[id] = Number(Number(d).toFixed(2));
  console.log(`${id.padEnd(14)} ${durations[id].toFixed(1)} s`);
}
writeFileSync(join(dir, 'durations.json'), JSON.stringify(durations, null, 2));
