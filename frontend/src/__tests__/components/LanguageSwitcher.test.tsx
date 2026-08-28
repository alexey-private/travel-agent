import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { renderWithI18n } from "../helpers/renderWithI18n";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "lang=; path=/; max-age=0";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("offers all three languages", () => {
    renderWithI18n(<LanguageSwitcher />);
    const select = screen.getByRole("combobox", { name: /language/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "עברית" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "RU" })).toBeInTheDocument();
  });

  it("shows the active locale as selected", () => {
    renderWithI18n(<LanguageSwitcher />, "ru");
    expect(screen.getByRole("combobox", { name: /language/i })).toHaveValue("ru");
  });

  it("switches the document to right-to-left when Hebrew is picked", async () => {
    renderWithI18n(<LanguageSwitcher />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /language/i }), "he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.cookie).toContain("lang=he");
  });
});
