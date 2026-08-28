import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { useT, useLocale } from "@/i18n/useT";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

function Probe() {
  const t = useT();
  const { locale, setLocale, dir } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="text">{t("common.loading")}</span>
      <button onClick={() => setLocale("he")}>to hebrew</button>
    </div>
  );
}

describe("LanguageProvider", () => {
  // jsdom reports en-US; each test that cares about detection names its own.
  function setNavigatorLanguages(tags: string[]) {
    Object.defineProperty(window.navigator, "languages", { value: tags, configurable: true });
    Object.defineProperty(window.navigator, "language", {
      value: tags[0] ?? "en-US",
      configurable: true,
    });
  }

  afterEach(() => {
    // Both are prototype getters in jsdom; dropping our own properties restores them.
    Reflect.deleteProperty(window.navigator, "languages");
    Reflect.deleteProperty(window.navigator, "language");
  });

  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "lang=; path=/; max-age=0";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("starts at the locale handed down from the server", () => {
    render(
      <LanguageProvider initialLocale="ru">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
    expect(screen.getByTestId("dir")).toHaveTextContent("ltr");
  });

  it("sets lang and dir on <html> for Hebrew", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByTestId("dir")).toHaveTextContent("rtl");
  });

  it("writes the choice to the cookie and to localStorage", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(document.cookie).toContain("lang=he");
    expect(window.localStorage.getItem("lang")).toBe("he");
  });

  it("pushes the choice to the backend", async () => {
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings?userId=session-test"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("survives a backend that refuses the update", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    render(
      <LanguageProvider initialLocale="en">
        <Probe />
      </LanguageProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /to hebrew/i }));
    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("adopts the localStorage value when the cookie is gone", async () => {
    window.localStorage.setItem("lang", "ru");
    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });

  it("adopts the server-side language on a first visit with no cookie", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ language: "he" }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("ignores the server-side language when a cookie is already set", async () => {
    document.cookie = "lang=ru; path=/";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ language: "he" }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="ru">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });

  it("falls back to the browser language when nothing is stored anywhere", async () => {
    setNavigatorLanguages(["he-IL", "en-US"]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("stores the detected language so Telegram and push agree with the web", async () => {
    setNavigatorLanguages(["ru-RU"]);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(document.cookie).toContain("lang=ru");
    expect(window.localStorage.getItem("lang")).toBe("ru");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/settings?userId=session-test"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lets a stored choice outrank the browser language", async () => {
    setNavigatorLanguages(["he-IL"]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ language: "ru" }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });

  it("does not second-guess a server that already read the header", async () => {
    // initialLocale is not the hard default, so the server had a header and
    // acted on it. navigator is a second reading of the same preference.
    setNavigatorLanguages(["he-IL"]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="ru">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
  });

  it("still applies the browser language when the backend is unreachable", async () => {
    setNavigatorLanguages(["he-IL"]);
    global.fetch = jest.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    await act(async () => {
      render(
        <LanguageProvider initialLocale="en">
          <Probe />
        </LanguageProvider>,
      );
    });

    expect(screen.getByTestId("locale")).toHaveTextContent("he");
  });

  it("throws a useful error when useT is called outside the provider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/LanguageProvider/);
    spy.mockRestore();
  });
});
