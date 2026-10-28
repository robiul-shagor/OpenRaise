import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, encodeErrorResult, UserRejectedRequestError } from "viem";
import { openRaiseAbi } from "./contracts";
import { describeError } from "./errors";

function revert(errorName: string, args?: readonly unknown[]) {
  const data = encodeErrorResult({ abi: openRaiseAbi, errorName, args } as never);
  const inner = new ContractFunctionRevertedError({ abi: openRaiseAbi, data, functionName: "refund" });
  return new BaseError("Execution reverted", { cause: inner });
}

describe("describeError", () => {
  it("maps custom errors to readable messages", () => {
    expect(describeError(revert("NothingToRefund"))).toMatch(/nothing to refund/i);
    expect(describeError(revert("NotCampaignOwner"))).toMatch(/only the campaign owner/i);
    expect(describeError(revert("InvalidStatus", [2]))).toMatch(/not in the right state/i);
  });
  it("detects wallet rejection", () => {
    const err = new BaseError("wrapped", { cause: new UserRejectedRequestError(new Error("nope")) });
    expect(describeError(err)).toBe("Transaction rejected in wallet.");
  });
  it("falls back for plain errors", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("weird")).toBe("Unknown error");
  });
});
