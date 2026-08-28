/**
 * Tests for AgentThoughts component.
 * Covers: empty states, step count label, expand/collapse, pending/success/error states.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithI18n } from "../helpers/renderWithI18n";
import AgentThoughts, { type ToolStep } from "@/components/chat/AgentThoughts";
import { MIRROR_UNDER_RTL } from "@/i18n/direction";

function makeStep(overrides: Partial<ToolStep> = {}): ToolStep {
  return {
    id: "step-0",
    tool: "web_search",
    input: { query: "Tokyo weather" },
    pending: false,
    output: { results: [] },
    ...overrides,
  };
}

describe("AgentThoughts", () => {
  it("renders nothing when there are no steps and not streaming", () => {
    const { container } = renderWithI18n(<AgentThoughts steps={[]} streaming={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'thinking' label when streaming with no steps", () => {
    renderWithI18n(<AgentThoughts steps={[]} streaming={true} />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("displays step count in the toggle button", () => {
    const steps = [makeStep({ id: "s1" }), makeStep({ id: "s2", tool: "get_weather" })];
    renderWithI18n(<AgentThoughts steps={steps} streaming={false} />);
    expect(screen.getByText(/2 tools/i)).toBeInTheDocument();
  });

  it("uses singular 'tool' for a single step", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep()]} streaming={false} />);
    expect(screen.getByText(/1 tool/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 tools/i)).not.toBeInTheDocument();
  });

  it("collapses the list when the toggle button is clicked", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep()]} streaming={false} />);
    // Step row is visible initially
    expect(screen.getByText("web_search")).toBeInTheDocument();
    // Click toggle to collapse
    fireEvent.click(screen.getByRole("button", { name: /tool/i }));
    expect(screen.queryByText("web_search")).not.toBeInTheDocument();
  });

  it("expands a step row to show input/output on click", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep()]} streaming={false} />);
    // Step row header is visible; click it
    const stepButton = screen.getByRole("button", { name: /web_search/i });
    fireEvent.click(stepButton);
    // Input and Output sections appear
    expect(screen.getByText(/input/i)).toBeInTheDocument();
    expect(screen.getByText(/output/i)).toBeInTheDocument();
  });

  it("shows a spinner for a pending step", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep({ pending: true })]} streaming={false} />);
    // lucide Loader2 renders as an svg; check the accessible role or class
    const svg = document.querySelector("svg.animate-spin");
    expect(svg).toBeInTheDocument();
  });

  it("shows a checkmark icon for a completed step", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep({ pending: false })]} streaming={false} />);
    // CheckCircle renders without animate-spin
    const spinners = document.querySelectorAll("svg.animate-spin");
    expect(spinners).toHaveLength(0);
  });

  it("shows an error section when the step has an error", () => {
    const step = makeStep({ pending: false, error: "Tool failed", output: undefined });
    renderWithI18n(<AgentThoughts steps={[step]} streaming={false} />);
    // Expand the step
    fireEvent.click(screen.getByRole("button", { name: /web_search/i }));
    expect(screen.getByText("Tool failed")).toBeInTheDocument();
  });
});

describe("AgentThoughts — icon direction", () => {
  // A chevron pointing at the content it opens is a direction, not a box, so
  // logical properties leave it alone. Under rtl it has to be flipped or it
  // points away from the panel it expands.
  const toggleIcon = () =>
    screen.getByRole("button", { name: /tool/i }).querySelector("svg")!;

  it("flips the collapsed chevron under a right-to-left locale", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep()]} streaming={false} />);
    // The panel opens expanded; collapsing it is what brings out the sideways
    // chevron, and only a sideways one has a direction to get wrong.
    fireEvent.click(screen.getByRole("button", { name: /tool/i }));
    expect(toggleIcon().getAttribute("class")).toContain(MIRROR_UNDER_RTL);
  });

  it("leaves the expanded chevron alone — it points down in both directions", () => {
    renderWithI18n(<AgentThoughts steps={[makeStep()]} streaming={false} />);
    expect(toggleIcon().getAttribute("class")).not.toContain("scale-x");
  });
});
