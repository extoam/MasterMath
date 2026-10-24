#!/usr/bin/env bash
# Build the app for GitHub Pages (served under /MasterMath/) and publish it on the gh-pages branch.
# Only the built app is published; her answers never leave the tablet.
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE_URL=$(git remote get-url origin)
SOURCE=$(git rev-parse --short HEAD)
rm -rf dist
BASE_PATH=/MasterMath/ npm run build
touch dist/.nojekyll   # serve files as they are, no Jekyll processing
cp dist/index.html dist/404.html
cd dist
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Deploy MasterMath from ${SOURCE}"
git push -q -f "$REMOTE_URL" gh-pages
echo "Published ${SOURCE} to gh-pages"
