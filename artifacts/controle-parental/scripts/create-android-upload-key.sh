#!/usr/bin/env bash
set -euo pipefail

KEYTOOL_BIN="${JAVA_HOME:+$JAVA_HOME/bin/keytool}"
if [[ -z "$KEYTOOL_BIN" || ! -x "$KEYTOOL_BIN" ]] || ! "$KEYTOOL_BIN" -help >/dev/null 2>&1; then
  KEYTOOL_BIN=""
  for candidate in /opt/homebrew/opt/openjdk@17/bin/keytool /usr/local/opt/openjdk@17/bin/keytool; do
    if [[ -x "$candidate" ]] && "$candidate" -help >/dev/null 2>&1; then
      KEYTOOL_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$KEYTOOL_BIN" ]]; then
  echo "keytool do JDK 17 não encontrado. Configure JAVA_HOME para o JDK usado pelo Gradle." >&2
  exit 1
fi

CREDENTIALS_DIR="${HOME}/.amparakids/credentials"
KEYSTORE_FILE="${CREDENTIALS_DIR}/android-upload.jks"
ALIAS="ampara-upload"

if [[ -e "$KEYSTORE_FILE" ]]; then
  echo "Já existe um arquivo de assinatura no diretório: $CREDENTIALS_DIR" >&2
  echo "Não vou sobrescrevê-lo. Faça backup e escolha outro procedimento." >&2
  exit 1
fi

umask 077
mkdir -p "$CREDENTIALS_DIR"
chmod 700 "$CREDENTIALS_DIR"

echo "Será criada uma chave Android de assinatura de lançamento para os apps Ampara."
echo "Uma única senha protegerá o keystore e a chave. Ela não será gravada neste repositório."
echo "Guarde uma cópia segura do arquivo .jks e das senhas; serão necessárias nas próximas atualizações."
read -r -s -p "Crie a senha da assinatura Android: " AMPARA_UPLOAD_PASSWORD
printf '\n' >&2
read -r -s -p "Repita a senha: " AMPARA_UPLOAD_PASSWORD_CONFIRMATION
printf '\n' >&2
trap 'unset AMPARA_UPLOAD_PASSWORD AMPARA_UPLOAD_PASSWORD_CONFIRMATION' EXIT
if [[ "$AMPARA_UPLOAD_PASSWORD" != "$AMPARA_UPLOAD_PASSWORD_CONFIRMATION" ]]; then
  echo "As senhas digitadas não são iguais. Nenhuma chave foi criada." >&2
  exit 1
fi
if ((${#AMPARA_UPLOAD_PASSWORD} < 6)); then
  echo "A senha deve ter pelo menos 6 caracteres. Nenhuma chave foi criada." >&2
  exit 1
fi
export AMPARA_UPLOAD_PASSWORD
"$KEYTOOL_BIN" -genkeypair -v \
  -keystore "$KEYSTORE_FILE" \
  -storetype JKS \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Ampara Kids Android Upload, O=SeVengo Smart Technology, C=BR" \
  -storepass:env AMPARA_UPLOAD_PASSWORD \
  -keypass:env AMPARA_UPLOAD_PASSWORD \
  -noprompt

chmod 600 "$KEYSTORE_FILE"

echo ""
echo "Chave criada em: $KEYSTORE_FILE"
echo "Guarde uma cópia segura: a mesma chave assina as atualizações futuras."
echo "Alias: $ALIAS"
