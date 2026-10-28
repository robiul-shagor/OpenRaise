#!/usr/bin/env bash
# Starts a fresh Anvil on $E2E_RPC_PORT, deploys contracts, then signals readiness on $E2E_READY_PORT.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$PATH"
RPC_PORT="${E2E_RPC_PORT:-8555}"
READY_PORT="${E2E_READY_PORT:-8556}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

anvil --port "$RPC_PORT" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  cast chain-id --rpc-url "http://127.0.0.1:$RPC_PORT" >/dev/null 2>&1 && break
  sleep 0.2
done

# Anvil dev account #0 (public test key from the default mnemonic).
PK=$(cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 0)
(cd "$ROOT/contracts" && forge script script/Deploy.s.sol --rpc-url "http://127.0.0.1:$RPC_PORT" --private-key "$PK" --broadcast --silent)
(cd "$ROOT/web" && node scripts/sync-contracts.mjs)

node -e "require('http').createServer((_, r) => r.end('ok')).listen($READY_PORT)" &
wait $ANVIL_PID
