#!/usr/bin/env bash
set -euo pipefail

KEYTOOL_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
if ! command -v "$KEYTOOL_BIN" >/dev/null 2>&1; then
  echo "keytool não encontrado. Instale um JDK ou configure JAVA_HOME." >&2
  exit 1
fi

CREDENTIALS_DIR="${HOME}/.amparakids/credentials"
KEYSTORE_FILE="${CREDENTIALS_DIR}/android-upload.jks"
CERTIFICATE_FILE="${CREDENTIALS_DIR}/android-upload-certificate.pem"
ALIAS="ampara-upload"

if [[ -e "$KEYSTORE_FILE" || -e "$CERTIFICATE_FILE" ]]; then
  echo "Já existe um arquivo de assinatura no diretório: $CREDENTIALS_DIR" >&2
  echo "Não vou sobrescrevê-lo. Faça backup e escolha outro procedimento." >&2
  exit 1
fi

mkdir -p "$CREDENTIALS_DIR"
chmod 700 "$CREDENTIALS_DIR"

echo "Será criada uma chave de upload Android para os apps Ampara."
echo "A senha será digitada no prompt protegido do keytool e não será gravada neste repositório."
echo "Guarde uma cópia segura do arquivo .jks e das senhas; serão necessárias nas próximas atualizações."
"$KEYTOOL_BIN" -genkeypair -v \
  -keystore "$KEYSTORE_FILE" \
  -storetype JKS \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Ampara Kids Android Upload, O=SeVengo Smart Technology, C=BR"

chmod 600 "$KEYSTORE_FILE"
"$KEYTOOL_BIN" -exportcert -rfc \
  -keystore "$KEYSTORE_FILE" \
  -alias "$ALIAS" \
  -file "$CERTIFICATE_FILE"
chmod 644 "$CERTIFICATE_FILE"

echo ""
echo "Chave criada em: $KEYSTORE_FILE"
echo "Certificado público para Google Play: $CERTIFICATE_FILE"
echo "Alias: $ALIAS"
