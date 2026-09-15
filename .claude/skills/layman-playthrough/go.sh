#!/bin/sh
# go.sh — submit one command file to a running driver.js and block until it answers.
#
#   sh go.sh <scratch-dir> <name> <file-with-js>
#   cat cmd.js | sh go.sh <scratch-dir> <name>
#   RD_SCRATCH=<scratch-dir> sh go.sh <name> [file-with-js]      # dir from the environment
#
# <name> must be unique per command: the driver runs each cmd/*.js once and keys the result
# file off the same name. Times out after ~10 minutes of wall time.
if [ -n "$RD_SCRATCH" ]; then D="$RD_SCRATCH"; NAME="$1"; SRC="$2"
else D="$1"; NAME="$2"; SRC="$3"; fi
if [ -z "$D" ] || [ -z "$NAME" ]; then echo "usage: sh go.sh <scratch-dir> <name> [file-with-js]"; exit 2; fi
mkdir -p "$D/cmd" "$D/out"
if [ -n "$SRC" ]; then cp "$SRC" "$D/cmd/$NAME.js"; else cat > "$D/cmd/$NAME.js"; fi
i=0
while [ ! -f "$D/out/$NAME.txt.done" ]; do
  i=$((i+1))
  if [ $i -gt 1200 ]; then echo "TIMEOUT waiting for $NAME"; exit 1; fi
  sleep 0.5
done
cat "$D/out/$NAME.txt"
