import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressRing } from "./ProgressRing";

describe("ProgressRing", () => {
  it("renders the clamped percentage label by default", () => {
    const { getByText } = render(<ProgressRing value={64} />);
    expect(getByText("64%")).toBeInTheDocument();
  });

  it("clamps out-of-range values", () => {
    const { getByText } = render(<ProgressRing value={150} />);
    expect(getByText("100%")).toBeInTheDocument();
  });

  it("supports a custom label and hiding the label", () => {
    const { getByText, queryByText, rerender } = render(
      <ProgressRing value={30} label="3/10" />,
    );
    expect(getByText("3/10")).toBeInTheDocument();

    rerender(<ProgressRing value={30} showLabel={false} />);
    expect(queryByText("30%")).not.toBeInTheDocument();
  });
});
