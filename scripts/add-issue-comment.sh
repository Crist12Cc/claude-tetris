#!/usr/bin/env bash
#
# Posts (or updates) the automated diagnosis comment on a GitHub issue.
# Usage: ./scripts/add-issue-comment.sh < diagnosis.md
#
# The comment body is read from stdin (never a shell argument) to avoid any
# quoting/escaping hazards from untrusted issue content. The issue number is
# read from the workflow event payload, so this script can never be pointed
# at a different issue.
#
# --edit-last edits Claude's own previous diagnosis comment on this issue
# instead of piling up a new one on every edit of the issue; --create-if-none
# falls back to creating a comment the first time.

set -euo pipefail

ISSUE=$(jq -r '.issue.number // empty' "${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH not set}")
if ! [[ "$ISSUE" =~ ^[0-9]+$ ]]; then
  echo "Error: no issue number in event payload" >&2
  exit 1
fi

gh issue comment "$ISSUE" --edit-last --create-if-none --body-file -
