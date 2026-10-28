import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar, StatusBadge } from "./ui";
import { Status } from "@/lib/format";

describe("StatusBadge", () => {
  it.each([
    [Status.Active, "Active"],
    [Status.Successful, "Successful"],
    [Status.Failed, "Failed · refunds open"],
    [Status.Withdrawn, "Withdrawn"],
  ])("renders %s as %s", (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("ProgressBar", () => {
  it("caps the visual bar at 100% for over-funded campaigns", () => {
    render(<ProgressBar bps={25_000} status={Status.Active} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });
});
