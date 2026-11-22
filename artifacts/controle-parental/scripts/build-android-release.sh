#!/usr/bin/env bash
set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$NATIVE_DIR"

# Release APKs must use the same backend. A stale staging APK can generate a
# valid pairing code that the child app cannot redeem in production (and vice
# versa), which surfaces as the misleading "invalid or expired" response.
PRODUCTION_API_URL="https://api-server-production-c955.up.railway.app"
CONFIGURED_API_URL="$(sed -n 's/^EXPO_PUBLIC_API_URL=//p' .env.local 2>/dev/null | head -n 1)"
if [[ "$CONFIGURED_API_URL" != "$PRODUCTION_API_URL" ]]; then
  echo "Build Android bloqueado: .env.local deve apontar para produção:" >&2
  echo "  EXPO_PUBLIC_API_URL=$PRODUCTION_API_URL" >&2
  echo "Valor encontrado: ${CONFIGURED_API_URL:-<ausente>}" >&2
  exit 1
fi
export EXPO_PUBLIC_API_URL="$PRODUCTION_API_URL"
echo "Backend dos APKs: $EXPO_PUBLIC_API_URL"

REQUESTED_VARIANT="${1:-}"
if [[ -z "$REQUESTED_VARIANT" ]]; then
  read -r -p "Variante (responsavel/crianca/ambos): " REQUESTED_VARIANT
fi
case "$REQUESTED_VARIANT" in
  responsavel|crianca) SELECTED_VARIANTS=("$REQUESTED_VARIANT") ;;
  ambos) SELECTED_VARIANTS=(responsavel crianca) ;;
  *) echo "Informe 'responsavel', 'crianca' ou 'ambos'." >&2; exit 2 ;;
esac

DEFAULT_KEYSTORE="${HOME}/.amparakids/credentials/android-upload.jks"
ANDROID_KEYSTORE_FILE="$DEFAULT_KEYSTORE"
if [[ ! -f "$ANDROID_KEYSTORE_FILE" ]]; then
  echo "Keystore não encontrado: $ANDROID_KEYSTORE_FILE" >&2
  exit 1
fi

echo "Usando a chave Android em: $ANDROID_KEYSTORE_FILE"
read -r -s -p "Senha do keystore: " ANDROID_KEYSTORE_PASSWORD
printf '\n' >&2
ANDROID_KEY_ALIAS="ampara-upload"
read -r -s -p "Senha da chave [Enter = mesma senha do keystore]: " ANDROID_KEY_PASSWORD
printf '\n' >&2
ANDROID_KEY_PASSWORD="${ANDROID_KEY_PASSWORD:-$ANDROID_KEYSTORE_PASSWORD}"

export ANDROID_KEYSTORE_FILE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD
trap 'unset ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD' EXIT

missing_signing_values=()
for variable_name in ANDROID_KEYSTORE_FILE ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  if [[ -z "${!variable_name:-}" ]]; then
    missing_signing_values+=("$variable_name")
  fi
done
if ((${#missing_signing_values[@]} > 0)); then
  printf 'Credencial de assinatura não informada: %s\n' "${missing_signing_values[*]}" >&2
  exit 1
fi

JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/java}"
if [[ -z "$JAVA_BIN" || ! -x "$JAVA_BIN" ]] || ! "$JAVA_BIN" -version >/dev/null 2>&1; then
  JAVA_BIN=""
  for candidate in /opt/homebrew/opt/openjdk@17/bin/java /usr/local/opt/openjdk@17/bin/java; do
    if [[ -x "$candidate" ]] && "$candidate" -version >/dev/null 2>&1; then
      JAVA_BIN="$candidate"
      JAVA_HOME="$(cd "$(dirname "$candidate")/.." && pwd)"
      export JAVA_HOME
      break
    fi
  done
fi
if [[ -z "$JAVA_BIN" ]]; then
  echo "JDK 17 não encontrado. Configure JAVA_HOME para o JDK usado pelo Gradle." >&2
  exit 1
fi

"$JAVA_BIN" "$NATIVE_DIR/scripts/ValidateAndroidKeystore.java"

export NODE_ENV=production
ANDROID_SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [[ -d "$ANDROID_SDK_DIR" ]]; then
  # expo prebuild --clean recreates android/ and removes local.properties;
  # export the SDK location so Gradle can resolve it on every run.
  export ANDROID_HOME="$ANDROID_SDK_DIR"
  export ANDROID_SDK_ROOT="$ANDROID_SDK_DIR"
fi
APKSIGNER_BIN="$ANDROID_SDK_DIR/build-tools/36.0.0/apksigner"
AAPT_BIN="$ANDROID_SDK_DIR/build-tools/36.0.0/aapt"
if [[ ! -x "$APKSIGNER_BIN" || ! -x "$AAPT_BIN" ]]; then
  echo "Ferramentas de verificação Android não encontradas em $ANDROID_SDK_DIR/build-tools/36.0.0" >&2
  exit 1
fi
DELIVERY_DIR="$NATIVE_DIR/dist/releases"
mkdir -p "$DELIVERY_DIR"

# Keep the default release small enough for this Mac and compatible with
# current Android phones. Set ANDROID_RELEASE_ABIS to override when a
# 32-bit-compatible APK is needed (for example: armeabi-v7a,arm64-v8a).
RELEASE_ABIS="${ANDROID_RELEASE_ABIS:-arm64-v8a}"
echo "ABIs do APK: $RELEASE_ABIS"

for AMPARA_APP in "${SELECTED_VARIANTS[@]}"; do
  export AMPARA_APP
  echo "Preparando o app Android: $AMPARA_APP"
  # The Android project and React Native autolinking files embed the selected
  # package name. Reusing the previous variant leaves stale Java references.
  pnpm exec expo prebuild --clean --platform android
  EXPECTED_PACKAGE="com.amparakids.${AMPARA_APP}"
  if ! rg -Fq "namespace '$EXPECTED_PACKAGE'" android/app/build.gradle \
    || ! rg -Fq "applicationId '$EXPECTED_PACKAGE'" android/app/build.gradle \
    || ! rg -Fq "package $EXPECTED_PACKAGE" android/app/src/main/java/com/amparakids/"$AMPARA_APP"/MainApplication.kt; then
    echo "Projeto Android gerado para $AMPARA_APP não corresponde ao identificador esperado $EXPECTED_PACKAGE." >&2
    exit 1
  fi
  # Avoid reusing a Gradle daemon started before the signing variables were exported.
  # Clean the app module so the two roles cannot reuse one another's JS bundle or autolinking cache.
  # Release APKs are distributed to physical Android phones. Do not compile
  # emulator-only x86/x86_64 ABIs: they trigger large native CMake builds and
  # are not needed for the signed phone APKs. Limiting workers also avoids
  # exhausting the Mac's disk/RAM while compiling Hermes and Expo modules.
  (cd android && ./gradlew --no-daemon --max-workers=2 \
    -PreactNativeArchitectures="$RELEASE_ABIS" \
    :app:clean assembleRelease)

  OUTPUT_FILE="$NATIVE_DIR/android/app/build/outputs/apk/release/app-release.apk"
  "$APKSIGNER_BIN" verify "$OUTPUT_FILE"
  BUNDLED_API_URL="$(unzip -p "$OUTPUT_FILE" assets/index.android.bundle | rg -ao 'https://api-server-[A-Za-z0-9-]+\.up\.railway\.app' | sort -u | head -n 1)"
  if [[ "$BUNDLED_API_URL" != "$PRODUCTION_API_URL" ]]; then
    echo "APK gerado com backend inesperado: ${BUNDLED_API_URL:-<ausente>} (esperado $PRODUCTION_API_URL)." >&2
    exit 1
  fi
  ACTUAL_PACKAGE="$("$AAPT_BIN" dump badging "$OUTPUT_FILE" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -n 1)"
  if [[ "$ACTUAL_PACKAGE" != "$EXPECTED_PACKAGE" ]]; then
    echo "Pacote Android inesperado: $ACTUAL_PACKAGE (esperado: $EXPECTED_PACKAGE)" >&2
    exit 1
  fi

  DELIVERY_FILE="$DELIVERY_DIR/ampara-${AMPARA_APP}.apk"
  cp "$OUTPUT_FILE" "$DELIVERY_FILE"
  echo "APK assinado para distribuição pelo site: $DELIVERY_FILE"
done
