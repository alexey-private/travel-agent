import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { DICTIONARIES } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { renderWithI18n } from "../helpers/renderWithI18n";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

/**
 * The switcher's own label is translated, so it cannot be found by an English
 * word. Looking it up through the dictionary of the locale being rendered keeps
 * the test honest in both directions: it finds the control, and it fails if the
 * control is ever labelled in some language other than the one on screen.
 */
function switcher(locale: Locale = "en"): HTMLElement {
  return screen.getByRole("combobox", { name: DICTIONARIES[locale]["common.language"] as string });
}

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "lang=; path=/; max-age=0";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("offers all three languages", () => {
    renderWithI18n(<LanguageSwitcher />);
    expect(switcher()).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "עברית" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RU" })).toBeInTheDocument();
  });

  it("shows the active locale as selected", () => {
    renderWithI18n(<LanguageSwitcher />, "ru");
    expect(switcher("ru")).toHaveValue("ru");
  });

  it("labels itself in the language it is rendered in", () => {
    renderWithI18n(<LanguageSwitcher />, "he");
    expect(switcher("he")).toBeInTheDocument();
  });

  it("switches the document to right-to-left when Hebrew is picked", async () => {
    renderWithI18n(<LanguageSwitcher />);
    await userEvent.selectOptions(switcher(), "he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.cookie).toContain("lang=he");
  });
});
