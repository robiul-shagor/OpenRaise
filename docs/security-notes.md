# Security notes

> **Not audited.** This is a portfolio demo for local and test networks only. Nothing here claims production readiness.

## Protections in place

| Risk | Mitigation | Evidence |
|---|---|---|
| Reentrancy on payout | Checks-effects-interactions, plus `nonReentrant` on `contribute`, `withdraw` and `refund` | `test_withdraw_reentrancyBlocked`, `test_refund_reentrancyBlocked` (attacker re-enters from `receive()`) |
| Double withdrawal | `withdrawn = true` before the transfer. Status becomes `Withdrawn`. | `test_withdraw_twiceReverts` |
| Double refund | `contributionOf = 0` before the transfer | `test_refund_twiceReverts`, invariant suite |
| Refund > contribution | Refund pays exactly the recorded contribution | `testFuzz_refundReturnsExactContribution`, invariant suite |
| Unauthorized withdrawal | `msg.sender == campaign.owner`. The registry admin has no special rights over funds. | `test_withdraw_unauthorizedReverts` |
| Accounting drift | Invariants: contract balance = Σin − Σout per asset; outstanding contributions = `raised − refunded`; withdrawn ⇒ no refunds | `test/invariant/OpenRaiseInvariant.t.sol` (256 runs × 64 depth, 0 reverts) |
| ETH/token confusion | ETH campaigns need `msg.value == amount`. Token campaigns need `msg.value == 0`. | `test_contribute_ethValueMismatchReverts`, `test_contribute_tokenWithEthReverts` |
| Unbounded gas | No loops over contributors. The only loop is the bounded, view-only `getCampaigns`. | — |
| Stored XSS via metadata | Plain-text rendering only. Onchain length caps: title 80, description 1000, creator name 48, category 24 bytes. | `test_create_revertsOnEmptyOrLong*` |
| Owner changes terms after people paid | `updateCampaign` only writes title, description, creator name and category; goal, deadline and asset have no setter | `test_update_ownerEditsTextWhileActive` |
| Owner pulls funds by cancelling | Cancel only sets a flag. Status becomes Cancelled, `withdraw` reverts, and every backer can `refund` | `test_cancel_ownerWithBackers_refundsEveryone`, invariant `cancelled ⇒ never withdrawn` |
| Admin takes funds | The admin has no withdraw or refund path for others' money; admin cancel only opens refunds | `test_cancel_byAdmin` |
| Malicious image links | Contract accepts only empty, `ipfs://` or `https://` (≤256 bytes); the frontend re-validates and renders only safe URLs, as `<img>` (never HTML) with no-referrer; broken images fall back | `test_image_rejectsBadSchemesAndLength`, `image.test.ts` |
| Upload endpoint abuse | Pinata JWT is server-only. 3 MB cap, file type checked by content (SVG refused), user filename never sent, 10 uploads per IP per 10 min | `upload.test.ts`, `route.test.ts` |
| Offensive images | Admin `setImageLocked` removes the image and blocks the owner from re-adding one | `test_image_adminLockRemovesAndBlocksOwner` |
| Mainnet deployment | `Deploy.s.sol` reverts on chain 1. The frontend refuses chain 1. | — |

## Static analysis

`forge lint` (Foundry 1.8.5) on `src/`:

| Finding | Location | Assessment |
|---|---|---|
| `reentrancy-eth` | `_send` in `withdraw`/`refund` | **False positive.** State is updated before the call and the functions are `nonReentrant`. Covered by the reentrancy tests. |
| `arbitrary-send-eth` | `_send` | **By design.** The recipient is `msg.sender`, after an owner check or the caller's own recorded contribution. |
| `block-timestamp` ×3 | deadline comparisons | **Accepted.** Deadlines are minutes to days long, and validator timestamp drift of a few seconds doesn't matter. The boundary is documented and tested. |
| `require-revert-in-loop` | `getCampaigns` → `getCampaign` | **Accepted.** The loop only visits ids in `[1, campaignCount]`, which always exist, so it can't revert. View-only. |

Slither and Aderyn were **not run**: neither is installed in this environment. Running them is the next step before anyone would treat this code seriously.

## Known limitations

- **The admin is a trusted moderator.** It can cancel any Active campaign, including a legitimate one, and hide campaigns from listings. It cannot move funds, but a compromised admin key could shut campaigns down. Use a multisig or timelock for anything beyond a demo.
- **Images are public and permanent.** Once pinned, an image stays on IPFS even if it's removed from the campaign; removal only stops OpenRaise displaying it. The upload rate limit lives in memory per server process, which is fine for a demo but needs a shared store (e.g. Redis) behind a load balancer. Any https image host can see a visitor's IP when the image loads.
- **Hiding is display-only.** A hidden campaign can still be called directly onchain. Cancelling is what actually stops contributions.

- **Owner can't receive ETH → funds stuck.** If the campaign owner is a contract that rejects ETH, `withdraw` reverts and the campaign stays `Successful` (`test_withdraw_rejectingOwnerRollsBack`). There's no recipient parameter or recovery path.
- **Fee-on-transfer and rebasing tokens** break the accounting. The allowlist exists to keep them out. The only token allowlisted by the deploy script is the plain `MockERC20`.
- **No cancellation.** An owner can't cancel early. Backers wait until the deadline.
- **No campaign updates or moderation.** Titles and descriptions are permanent and public.
- **Timestamp trust.** The success/failure decision depends on `block.timestamp`.
- **Mock token has an open `mint`.** It's intentionally worthless and for tests only.
- **Dev wallet connectors** rely on Anvil's unlocked accounts. Disable them with `NEXT_PUBLIC_ENABLE_DEV_WALLET=false` on any shared deployment.
- No legal, economic or independent security review has been done. Real-world fundraising needs all three.
