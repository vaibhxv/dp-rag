#!/usr/bin/env bash
# Runs Weaviate as a native binary (no Docker), for low-RAM / low-disk machines.
# Downloads the macOS/Linux release into .local/bin on first run.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${WEAVIATE_VERSION:-1.40.5}"
BIN=".local/bin/weaviate"

if [[ ! -x "$BIN" ]]; then
  mkdir -p .local/bin
  case "$(uname -s)-$(uname -m)" in
    Darwin-*)        ASSET="weaviate-v${VERSION}-darwin-all.zip" ;;
    Linux-x86_64)    ASSET="weaviate-v${VERSION}-linux-amd64.tar.gz" ;;
    Linux-aarch64|Linux-arm64) ASSET="weaviate-v${VERSION}-linux-arm64.tar.gz" ;;
    *) echo "Unsupported platform"; exit 1 ;;
  esac
  URL="https://github.com/weaviate/weaviate/releases/download/v${VERSION}/${ASSET}"
  echo "Downloading $URL"
  curl -fsSL -o ".local/$ASSET" "$URL"
  EXPECTED="$(curl -fsSL "$URL.sha256" | awk '{print $1}')"
  ACTUAL="$(shasum -a 256 ".local/$ASSET" | awk '{print $1}')"
  [[ "$EXPECTED" == "$ACTUAL" ]] || { echo "Checksum mismatch"; exit 1; }
  if [[ "$ASSET" == *.zip ]]; then unzip -o -q ".local/$ASSET" weaviate -d .local/bin
  else tar -xzf ".local/$ASSET" -C .local/bin weaviate; fi
  rm ".local/$ASSET"
fi

export AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true   # local MVP only
export PERSISTENCE_DATA_PATH="$PWD/.local/weaviate-data"
export CLUSTER_HOSTNAME=node1
export RAFT_BOOTSTRAP_EXPECT=1
export DEFAULT_VECTORIZER_MODULE=none
export ENABLE_MODULES=text2vec-ollama,generative-ollama
export DISABLE_TELEMETRY=true
export QUERY_DEFAULTS_LIMIT=25
# Weaviate goes read-only at 90% disk use by default. Dev laptops are often fuller
# than that, so relax it (keep the default on real servers).
export DISK_USE_WARNING_PERCENTAGE=95
export DISK_USE_READONLY_PERCENTAGE=98
# Local CPU/Metal LLMs can be slow on small machines; default module timeout is 50s.
export MODULES_CLIENT_TIMEOUT=180s

exec "$BIN" --host 127.0.0.1 --port 8080 --scheme http
