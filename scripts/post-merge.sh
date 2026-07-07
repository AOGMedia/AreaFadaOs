#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push-force

# Sync to GitHub after every task merge
if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set. Cannot push to GitHub." >&2
  echo "  → Add GITHUB_TOKEN in the Replit Secrets pane (a GitHub Personal Access Token with repo scope)." >&2
  exit 1
fi

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
  PUSH_EXIT=$?
  echo "" >&2
  echo "ERROR: git push to GitHub failed (exit code ${PUSH_EXIT})." >&2
  echo "" >&2
  echo "  If push was blocked by GitHub secret scanning, visit:" >&2
  echo "  https://github.com/${GITHUB_REPO}/security/secret-scanning" >&2
  echo "  and allow the flagged push from there, then re-run this script." >&2
  echo "" >&2
  echo "  If the branch is behind (non-fast-forward), the remote may have diverged." >&2
  exit $PUSH_EXIT
fi
