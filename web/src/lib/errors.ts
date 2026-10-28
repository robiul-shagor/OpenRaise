import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const MESSAGES: Record<string, string> = {
  AssetNotAllowed: "This asset is not allowed for campaigns.",
  InvalidGoal: "Goal must be greater than zero.",
  InvalidDeadline: "Deadline must be between 1 minute and 365 days from now (chain time).",
  InvalidTitle: "Title must be 1–80 bytes.",
  DescriptionTooLong: "Description must be at most 1000 bytes.",
  InvalidCreatorName: "Team or creator name must be 1–48 bytes.",
  InvalidCategory: "Pick a category.",
  CampaignNotFound: "Campaign not found.",
  InvalidAmount: "Invalid amount.",
  InvalidStatus: "The campaign is not in the right state for this action. It may have just ended — refresh.",
  NotCampaignOwner: "Only the campaign owner can do this.",
  NotAuthorized: "Only the campaign owner or the platform admin can cancel.",
  OwnableUnauthorizedAccount: "Only the platform admin can do this.",
  NothingToRefund: "You have nothing to refund (or already claimed).",
  NativeTransferFailed: "ETH transfer to the recipient failed.",
  ERC20InsufficientAllowance: "Token allowance too low — approve first.",
  ERC20InsufficientBalance: "Insufficient token balance. Use the mUSD faucet.",
};

/** Turns wallet/RPC/revert errors into a short, user-facing message. */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "Transaction rejected in wallet.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (name) return `Reverted: ${name}`;
      if (revert.reason) return `Reverted: ${revert.reason}`;
    }
    if (/insufficient funds/i.test(error.message)) return "Insufficient ETH for amount plus gas.";
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "Unknown error";
}
