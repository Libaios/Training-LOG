#!/usr/bin/env bash
# Construit l'appli et publie le dossier dist sur la branche gh-pages.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
OUT=$(mktemp -d)
cp -r dist/. "$OUT"
touch "$OUT/.nojekyll"
SHA=$(git rev-parse --short HEAD)
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "Publication de $SHA"
git push -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
