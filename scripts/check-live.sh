#!/usr/bin/env bash
# Wait until the live app serves the current commit, then check the files offline use depends on.
# Exit 0 only when the tablet would get exactly this version.
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${LIVE_URL:-https://extoam.github.io/MasterMath/}"
WANT=$(git rev-parse HEAD)
echo "Waiting for ${URL} to serve ${WANT:0:7} (GitHub Pages usually takes 1–2 minutes)…"
for _ in $(seq 1 60); do
  GOT=$(curl -fsS "${URL}version.txt?nocache=$(date +%s)" 2>/dev/null || true)
  [ "$GOT" = "$WANT" ] && break
  sleep 10
done
if [ "$GOT" != "$WANT" ]; then
  echo "NOT LIVE after 10 minutes: serving '${GOT:-nothing}', expected ${WANT:0:7}." >&2
  echo "Check: gh api repos/extoam/MasterMath/pages/builds/latest --jq .status" >&2
  exit 1
fi
fail=0
for f in "" sw.js manifest.webmanifest registerSW.js pwa-192.png; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${URL}${f}")
  if [ "$code" = "200" ]; then echo "ok   ${URL}${f}"; else echo "FAIL ${URL}${f} -> ${code}" >&2; fail=1; fi
done
if ! curl -fsS "$URL" | grep -q 'src="/MasterMath/assets/'; then
  echo "FAIL index.html does not load assets from /MasterMath/ (built without BASE_PATH?)" >&2
  fail=1
fi
[ "$fail" = 0 ] && echo "LIVE: ${URL} serves ${WANT:0:7}; offline files present."
exit "$fail"
