#!/usr/bin/env bash
# Turns demo/out/raw.webm into demo/rag-demo.mp4.
# The ingestion wait (between the ingest-start and ingest-end marks) is sped
# up; the on-screen caption says so. Everything else plays in real time.
# Blank page-load frames before the intro mark are trimmed. When the recording
# carries narration marks, the Hinglish voice-over is mixed in (mix-narration.mjs).
set -euo pipefail
cd "$(dirname "$0")"

SPEED="${SPEED:-6}"
read -r B S E < <(python3 -c "
import json; m={x['name']:x['t'] for x in json.load(open('out/marks.json'))}
print(max(m['intro']-0.3, 0), m['ingest-start']+1.0, m['ingest-end']-0.5)")

ffmpeg -y -loglevel error -i out/raw.webm -filter_complex "
  [0:v]trim=${B}:${S},setpts=PTS-STARTPTS[a];
  [0:v]trim=${S}:${E},setpts=(PTS-STARTPTS)/${SPEED}[b];
  [0:v]trim=start=${E},setpts=PTS-STARTPTS[c];
  [a][b][c]concat=n=3:v=1:a=0,fps=30,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -preset slow -crf 22 -movflags +faststart out/silent.mp4

# Hinglish voice-over (if the recording was paced with narration marks).
if grep -q '"say:' out/marks.json; then
  node mix-narration.mjs out/silent.mp4 rag-demo.mp4
else
  cp out/silent.mp4 rag-demo.mp4
fi

echo "Wrote $(pwd)/rag-demo.mp4 ($(du -h rag-demo.mp4 | cut -f1))"
