#!/usr/bin/env bash
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$NATIVE_DIR"

AMPARA_APP="${1:-}"
if [[ -z "$AMPARA_APP" ]]; then
  read -r -p "Variante (responsavel/crianca): " AMPARA_APP
fi
case "$AMPARA_APP" in
  responsavel|crianca) ;;
  *) echo "Informe 'responsavel' ou 'crianca'." >&2; exit 2 ;;
esac

DEFAULT_KEYSTORE="${HOME}/.amparakids/credentials/android-upload.jks"
read -r -p "Caminho do keystore [$DEFAULT_KEYSTORE]: " ANDROID_KEYSTORE_FILE
ANDROID_KEYSTORE_FILE="${ANDROID_KEYSTORE_FILE:-$DEFAULT_KEYSTORE}"
if [[ ! -f "$ANDROID_KEYSTORE_FILE" ]]; then
  echo "Keystore não encontrado: $ANDROID_KEYSTORE_FILE" >&2
  exit 1
fi

read -r -s -p "Senha do keystore: " ANDROID_KEYSTORE_PASSWORD
printf '\n' >&2
read -r -p "Alias da chave [ampara-upload]: " ANDROID_KEY_ALIAS
ANDROID_KEY_ALIAS="${ANDROID_KEY_ALIAS:-ampara-upload}"
read -r -s -p "Senha da chave: " ANDROID_KEY_PASSWORD
printf '\n' >&2

export ANDROID_KEYSTORE_FILE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD
export AMPARA_APP
trap 'unset ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD' EXIT

pnpm exec expo prebuild --platform android
(cd android && ./gradlew assembleRelease)

OUTPUT_FILE="$NATIVE_DIR/android/app/build/outputs/apk/release/app-release.apk"
DELIVERY_DIR="$NATIVE_DIR/dist/releases"
DELIVERY_FILE="$DELIVERY_DIR/ampara-${AMPARA_APP}.apk"
mkdir -p "$DELIVERY_DIR"
cp "$OUTPUT_FILE" "$DELIVERY_FILE"

echo ""
echo "APK assinado para distribuição pelo site: $DELIVERY_FILE"
echo "Variante: $AMPARA_APP"
