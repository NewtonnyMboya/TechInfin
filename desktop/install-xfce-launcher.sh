#!/usr/bin/env bash
set -euo pipefail
APP_NAME="TechInfin"
ICON_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/techinfin.svg"
if [[ ! -f "$ICON_SOURCE" ]]; then echo "Missing icon: $ICON_SOURCE" >&2; exit 1; fi
URL="${1:-}"
if [[ -z "$URL" ]]; then
  read -rp "Enter your deployed TechInfin marketplace URL (https://...): " URL
fi
if [[ ! "$URL" =~ ^https?:// ]]; then echo "Please provide a valid http:// or https:// URL." >&2; exit 1; fi
mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps" "$HOME/.local/share/applications" "$HOME/.local/bin" "$HOME/.config/techinfin"
install -m 644 "$ICON_SOURCE" "$HOME/.local/share/icons/hicolor/scalable/apps/techinfin.svg"
printf '%s\n' "$URL" > "$HOME/.config/techinfin/desktop-url"
cat > "$HOME/.local/bin/techinfin-launcher" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
URL_FILE="$HOME/.config/techinfin/desktop-url"
if [[ ! -s "$URL_FILE" ]]; then
  echo "Set the marketplace URL in $URL_FILE" >&2
  exit 1
fi
exec xdg-open "$(head -n 1 "$URL_FILE")"
LAUNCHER
chmod 755 "$HOME/.local/bin/techinfin-launcher"
cat > "$HOME/.local/share/applications/techinfin.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=TechInfin
GenericName=Software Marketplace
Comment=Open the TechInfin software marketplace
Exec=$HOME/.local/bin/techinfin-launcher
Icon=techinfin
Terminal=false
Categories=Network;Utility;
StartupNotify=true
DESKTOP
chmod 644 "$HOME/.local/share/applications/techinfin.desktop"
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$HOME/.local/share/applications" || true; fi
echo "TechInfin icon and launcher installed. Log out/in or refresh the XFCE menu if it does not appear immediately."
echo "To create a desktop shortcut: cp '$HOME/.local/share/applications/techinfin.desktop' '$HOME/Desktop/TechInfin.desktop' && chmod +x '$HOME/Desktop/TechInfin.desktop'"
