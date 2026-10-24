#!/usr/bin/env bash
# Build the app for GitHub Pages (served under /MasterMath/) and publish it on the gh-pages branch.
# Only the built app is published; children's answers never leave their tablets.
set -euo pipefail
cd "$(dirname "$0")/.."

# Publish only what is committed and pushed, so the live app always matches a commit on GitHub.
if [ -n "$(git status --porcelain)" ]; then
  echo "Refusing to deploy: uncommitted changes. Commit (and push) first." >&2
  git status --short >&2
  exit 1
fi
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Refusing to deploy: HEAD is not origin/main. Push main (or check out main) first." >&2
  exit 1
fi

REMOTE_URL=$(git remote get-url origin)
SHA=$(git rev-parse HEAD)
npx vitest run
rm -rf dist
BASE_PATH=/MasterMath/ npm run build
echo "$SHA" > dist/version.txt   # what check-live waits for
touch dist/.nojekyll             # serve files as they are, no Jekyll processing
cp dist/index.html dist/404.html
cd dist
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Deploy MasterMath from ${SHA:0:7}"
git push -q -f "$REMOTE_URL" gh-pages
echo "Published ${SHA:0:7} to gh-pages. Next: npm run check-live"
