#!/bin/sh
# Wrap this WebExtension in an Xcode project for Safari (macOS + iOS).
# Requires Xcode. Re-run after editing the extension to refresh the copy inside the project.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../OrigamiTextReader-Safari"
xcrun safari-web-extension-converter "$HERE" \
  --project-location "$OUT" \
  --app-name "Origami Text Reader" \
  --bundle-identifier info.futuretextlab.origami-reader \
  --copy-resources \
  --no-open \
  --force
echo "Project generated in $OUT — open it in Xcode, select your team, and run the macOS target."
