#!/usr/bin/env bash
set +H
export GIT_PAGER=cat
export PAGER=cat
export GIT_TERMINAL_PROMPT=0

PORT=3000
INTERVAL=15
PID_FILE="/tmp/ensure-public-port.pid"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[ensure-public-port] Instância já em execução com PID $OLD_PID."
    exit 0
  fi
fi

echo $$ > "$PID_FILE"

cleanup() {
  rm -f "$PID_FILE"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

if [ -z "$CODESPACE_NAME" ]; then
  echo "[ensure-public-port] CODESPACE_NAME não definido. Encerrando."
  exit 1
fi

echo "[ensure-public-port] Iniciado monitoramento resiliente da porta $PORT no Codespace $CODESPACE_NAME..."

while true; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    CURRENT_VISIBILITY=$(gh codespace ports -c "$CODESPACE_NAME" 2>/dev/null | awk -v p="$PORT" '$2 == p {print $3}')
    if [ "$CURRENT_VISIBILITY" != "public" ]; then
      echo "$(date): Porta $PORT detectada com visibilidade '$CURRENT_VISIBILITY'. Reaplicando visibilidade pública..."
      if gh codespace ports visibility "$PORT:public" -c "$CODESPACE_NAME"; then
        echo "$(date): Porta $PORT alterada com sucesso para pública."
      else
        echo "$(date): Falha temporária ao alterar porta $PORT para pública via gh CLI."
      fi
    fi
  fi
  sleep "$INTERVAL"
done
