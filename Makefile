# OpenRaise — local development. Anvil only; never point these at mainnet.
SHELL := /bin/bash
export PATH := $(HOME)/.foundry/bin:$(PATH)

# Resolve Foundry tools explicitly: macOS make 3.81 ignores the exported PATH for simple commands.
FOUNDRY_BIN := $(or $(shell command -v forge 2>/dev/null | xargs dirname 2>/dev/null),$(HOME)/.foundry/bin)
FORGE := $(FOUNDRY_BIN)/forge
ANVIL := $(FOUNDRY_BIN)/anvil
CAST := $(FOUNDRY_BIN)/cast

ANVIL_PORT ?= 8545
RPC_URL ?= http://127.0.0.1:$(ANVIL_PORT)
# Local chain is saved here (every 10s and on exit) and reloaded on start, so campaigns survive restarts.
ANVIL_STATE ?= contracts/.anvil-state.json
# Snapshot file for moving a running chain into the saved state (see anvil-export / anvil-import).
ANVIL_SNAPSHOT ?= contracts/.anvil-snapshot.hex
DEPLOYED_ADDR = $(shell sed -n 's/.*"openRaise": *"\(0x[0-9a-fA-F]*\)".*/\1/p' contracts/deployments/31337.json 2>/dev/null)
# Anvil dev account #0 from the public default mnemonic. Test-only key.
ANVIL_PK := $(shell $(CAST) wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 0 2>/dev/null)

.PHONY: screenshots install anvil anvil-reset anvil-export anvil-import ensure-deployed deploy seed sync dev up test test-contracts test-web e2e lint fmt

install:            ## Install contract libs and web deps
	cd contracts && [ -d lib/forge-std ] || $(FORGE) install foundry-rs/forge-std@v1.17.0 --no-git
	cd contracts && [ -d lib/openzeppelin-contracts ] || $(FORGE) install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
	cd web && npm ci

anvil:              ## Run the local chain (foreground). Saves to $(ANVIL_STATE) and reloads it next time
	@if [ -f $(ANVIL_STATE) ]; then echo "Loading saved chain from $(ANVIL_STATE)"; else echo "No saved chain yet — starting fresh (run 'make up' next)"; fi
	$(ANVIL) --port $(ANVIL_PORT) --state $(ANVIL_STATE) --state-interval 10

anvil-reset:        ## Wipe the saved local chain (stop 'make anvil' first)
	@if $(CAST) chain-id --rpc-url $(RPC_URL) >/dev/null 2>&1; then echo "Anvil is still running on $(RPC_URL) — stop it (Ctrl-C) first, or it will save the chain again on exit."; exit 1; fi
	rm -f $(ANVIL_STATE)
	@echo "Saved chain deleted. Next 'make anvil' + 'make up' starts fresh."

anvil-export:       ## Snapshot the running chain to $(ANVIL_SNAPSHOT) (works even without --state)
	$(CAST) rpc --rpc-url $(RPC_URL) anvil_dumpState | tr -d '"' > $(ANVIL_SNAPSHOT)
	@echo "Saved snapshot to $(ANVIL_SNAPSHOT)"

anvil-import:       ## Load $(ANVIL_SNAPSHOT) into the running chain (it is then kept in the saved state)
	@test -s $(ANVIL_SNAPSHOT) || { echo "No snapshot at $(ANVIL_SNAPSHOT)"; exit 1; }
	@$(CAST) rpc --rpc-url $(RPC_URL) anvil_loadState "$$(cat $(ANVIL_SNAPSHOT))" >/dev/null
	@echo "Imported $(ANVIL_SNAPSHOT) — chain is at block $$($(CAST) block-number --rpc-url $(RPC_URL))"

ensure-deployed:    ## Deploy + seed only if OpenRaise isn't already on the chain (keeps saved campaigns)
	@$(CAST) chain-id --rpc-url $(RPC_URL) >/dev/null 2>&1 || { echo "No chain at $(RPC_URL). Run 'make anvil' in another terminal first."; exit 1; }
	@code="$$([ -n "$(DEPLOYED_ADDR)" ] && $(CAST) code $(DEPLOYED_ADDR) --rpc-url $(RPC_URL) 2>/dev/null)"; \
	if [ -n "$$code" ] && [ "$$code" != "0x" ]; then \
		echo "OpenRaise already deployed at $(DEPLOYED_ADDR) — keeping existing campaigns."; \
		$(MAKE) --no-print-directory sync; \
	else \
		echo "OpenRaise not found on this chain — deploying and seeding demo campaigns."; \
		$(MAKE) --no-print-directory deploy seed; \
	fi

deploy:             ## Force a NEW deployment (creates a second copy on a saved chain — prefer 'make up')
	cd contracts && $(FORGE) script script/Deploy.s.sol --rpc-url $(RPC_URL) --private-key $(ANVIL_PK) --broadcast
	$(MAKE) sync

seed:               ## Create demo campaigns (Anvil only)
	cd contracts && $(FORGE) script script/Seed.s.sol --rpc-url $(RPC_URL) --broadcast

sync:               ## Copy ABIs + addresses into web/src/generated
	cd contracts && $(FORGE) build
	cd web && npm run sync

dev:                ## Start the Next.js dev server
	cd web && npm run dev

up: ensure-deployed dev ## Deploy+seed if needed, then start the app (run 'make anvil' in another terminal first)

test-contracts:
	cd contracts && $(FORGE) test

test-web:
	cd web && npm run lint && npm run typecheck && npm test

e2e:                ## Starts its own Anvil on :8555 and Next on :3100
	cd web && npx playwright test

screenshots:        ## Regenerate docs/images/*.png from a fresh demo chain (own Anvil :8600, Next :3200)
	cd web && npx playwright test -c playwright.screenshots.config.ts

test: test-contracts test-web e2e

fmt:
	cd contracts && $(FORGE) fmt
