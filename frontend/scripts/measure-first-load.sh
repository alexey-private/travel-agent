#!/usr/bin/env bash
#
# First-load JS for `/`: every script the server-rendered HTML asks for, gzipped.
#
# `next build` with Turbopack prints no First Load JS table, and the build
# manifests do not name the per-route client chunks, so the honest way to ask the
# question is to serve the build and read the document. Run it before and after a
# change that moves code off the critical path; it is what produced the numbers
# in the audit's O7 (251,216 bytes before deferring the markdown renderer,
# 208,862 after).
#
#   npm run build --workspace=frontend && frontend/scripts/measure-first-load.sh
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-3111}"

# A server left over from an earlier run answers with an earlier build, which is
# how the first attempt at this measurement reported the same number twice.
fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true
sleep 1

cd "$ROOT/frontend"
npx next start -p "$PORT" >/tmp/next-measure.log 2>&1 &
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://localhost:$PORT/" && break
  sleep 0.5
done

html=$(curl -s "http://localhost:$PORT/")
total=0
count=0
while read -r p; do
  [ -n "$p" ] || continue
  f="$ROOT/frontend/.next${p#/_next}"
  if [ -f "$f" ]; then
    sz=$(gzip -c "$f" | wc -c)
    total=$((total + sz))
    count=$((count + 1))
    printf '%9d  %s\n' "$sz" "$p"
  else
    echo "MISSING   $f"
  fi
done <<< "$(printf '%s' "$html" | grep -o 'src="/_next/static/chunks/[^"]*"' | sed 's/^src="//; s/"$//' | sort -u)"

echo "----"
echo "scripts: $count"
echo "total gzipped bytes: $total"

fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true
