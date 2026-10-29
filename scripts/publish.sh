#!/usr/bin/env bash
# Construit l'appli et publie le dossier dist sur la branche gh-pages (push normal, sans réécrire l'historique).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
REMOTE=$(git remote get-url origin)
SHA=$(git rev-parse --short HEAD)
OUT=$(mktemp -d)
if git clone -q --depth 1 --branch gh-pages "$REMOTE" "$OUT" 2>/dev/null; then
  git -C "$OUT" rm -rq --ignore-unmatch .
else
  git init -q -b gh-pages "$OUT"
fi
cp -r dist/. "$OUT"
touch "$OUT/.nojekyll"
cd "$OUT"
git add -A
if git diff --cached --quiet; then
  echo "Rien de nouveau à publier."
  exit 0
fi
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "Publication de $SHA"
git push -q "$REMOTE" HEAD:gh-pages
echo "Publié : $SHA"
