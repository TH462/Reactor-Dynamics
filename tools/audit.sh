#!/usr/bin/env sh
#  tools/audit.sh — THE way to start a #221 audit slice, from Git Bash. Sibling of tools/audit.cmd;
#  see tools/audit_preflight.js for why this exists (#382).
#
#      sh tools/audit.sh 344              launch slice 9 (#344)
#      sh tools/audit.sh 344 --print      check and print the launch line, launch nothing
#
#  Preflight exits 2 and names the cause if the session would not actually be independent; this
#  script then refuses to launch. Do not work around it by typing the claude command by hand —
#  that is precisely the failure being fixed.
set -e

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SLICE=$1

usage() {
  echo "usage: sh tools/audit.sh <slice-issue-number> [--print]" >&2
  echo "" >&2
  echo "  Slice issues for the #221 programme: 295 296 297 298 299 300 301 342 344" >&2
  echo "  Running order: 1 . 2 . 3 . 9 . 8 . 4 . 5 . 6 . 7" >&2
  exit 2
}

case "$SLICE" in
  ''|*[!0-9]*) usage ;;
esac

cd "$ROOT"
node tools/audit_preflight.js "$SLICE" || exit 2

if [ "$2" = "--print" ]; then
  echo "  [--print] not launching."
  exit 0
fi

echo "Launching audit session for slice #$SLICE ..."
echo ""
exec claude --settings .claude/settings.audit.json "You are running audit slice #$SLICE of the independent subsystem audit programme (GitHub #221). Read Blueprint/AUDIT_CHARTER.md first — it replaces CLAUDE.md for this session. Then read the slice's scope and rubric with: gh issue view $SLICE --repo TH462/Reactor-Dynamics. Before you read any source file, post the independence self-check as a comment on that issue: state whether CLAUDE.md was auto-loaded into your context without you reading it, and whether you can see an auto-memory index. If either is present, stop and say so — the slice is not independent and the exclusion needs fixing first."
