/**
 * Tests for AgentSelector component.
 * Covers: renders both tabs, active state, calls onChange on click.
 */

import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithI18n } from "../helpers/renderWithI18n";
import AgentSelector from "@/components/shared/AgentSelector";

describe("AgentSelector — rendering", () => {
  it("renders both Travel and Shopping tabs", () => {
    renderWithI18n(<AgentSelector value="travel" onChange={jest.fn()} />);
    expect(screen.getByRole("button", { name: /travel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /shopping/i })).toBeInTheDocument();
  });

  it("applies active styles to the selected tab (travel)", () => {
    renderWithI18n(<AgentSelector value="travel" onChange={jest.fn()} />);
    expect(screen.getByRole("button", { name: /travel/i })).toHaveClass("bg-white");
    expect(screen.getByRole("button", { name: /shopping/i })).not.toHaveClass("bg-white");
  });

  it("applies active styles to the selected tab (shopping)", () => {
    renderWithI18n(<AgentSelector value="shopping" onChange={jest.fn()} />);
    expect(screen.getByRole("button", { name: /shopping/i })).toHaveClass("bg-white");
    expect(screen.getByRole("button", { name: /travel/i })).not.toHaveClass("bg-white");
  });
});

describe("AgentSelector — onChange", () => {
  it("calls onChange with 'shopping' when Shopping tab is clicked", () => {
    const onChange = jest.fn();
    renderWithI18n(<AgentSelector value="travel" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /shopping/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("shopping");
  });

  it("calls onChange with 'travel' when Travel tab is clicked", () => {
    const onChange = jest.fn();
    renderWithI18n(<AgentSelector value="shopping" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /travel/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("travel");
  });
});
