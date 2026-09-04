import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownMessage } from "./MarkdownMessage";

describe("MarkdownMessage", () => {
  it("renders common markdown structures as HTML", () => {
    render(
      <MarkdownMessage
        content={[
          "# Weekly Plan",
          "",
          "**Bold** and _italic_ text.",
          "",
          "- [x] Completed",
          "- [ ] Pending",
          "",
          "| Task | Status |",
          "| --- | --- |",
          "| Workout | Done |",
          "",
          "`inline` code",
          "",
          "[Reference](https://example.com)",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Weekly Plan" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reference" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("inline").tagName.toLowerCase()).toBe("code");
  });
});
