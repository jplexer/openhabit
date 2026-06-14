export OPENHABIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export MODDABLE="$OPENHABIT_DIR/moddable"
export PATH="$MODDABLE/build/bin/lin/release:$PATH"

# Absolute path to the custom subplatform target directory for this board.
export OPENHABIT_TARGET="esp32:$OPENHABIT_DIR/targets/openhabit"

echo "openhabit env ready:"
echo "  MODDABLE        = $MODDABLE"
echo "  idf.py          = $(command -v idf.py)"
echo "  target          = $OPENHABIT_TARGET"
