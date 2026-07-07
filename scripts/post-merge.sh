#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push-force

# Sync to GitHub after every task merge
if [ -z "$GITHUB_TOKEN" ]; then
  echo "WARNING: GITHUB_TOKEN secret is not set — skipping GitHub sync." >&2
  echo "  → Add GITHUB_TOKEN in the Replit Secrets pane (a GitHub Personal Access Token with repo scope)." >&2
else
  GITHUB_REPO="AOGMedia/AreaFadaOs"
  GITHUB_REPO_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"

  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$GITHUB_REPO_URL"
  else
    git remote add origin "$GITHUB_REPO_URL"
  fi

  if git push origin main 2>&1; then
    echo "Successfully pushed to GitHub (${GITHUB_REPO})."
  else
    echo "" >&2
    echo "WARNING: git push to GitHub failed — Replit task still succeeded." >&2
    echo "  If blocked by secret scanning, visit:" >&2
    echo "  https://github.com/${GITHUB_REPO}/security/secret-scanning" >&2
    echo "  and allow the flagged push, then it will sync automatically on the next task merge." >&2
  fi
fi
