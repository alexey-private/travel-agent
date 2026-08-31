/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://app.example.com/"}
 */
import { cookieWrittenWhenSwitchingTo } from "../helpers/languageCookieWrite";

jest.mock("@/lib/api", () => ({ getOrCreateUserId: () => "session-test" }));

/**
 * The `Secure` half of the language cookie rule. It needs its own file because
 * the flag is decided from the page's protocol and a jsdom environment's URL is
 * fixed per file — this one is served over HTTPS, the plaintext half lives in
 * `LanguageProvider.test.tsx`.
 */
describe("the language cookie on an HTTPS page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
  });

  it("is marked Secure, so it never travels over plaintext", async () => {
    const written = await cookieWrittenWhenSwitchingTo("he");

    expect(written).toBeDefined();
    expect(written).toContain("; Secure");
    expect(written).toContain("SameSite=Lax");
  });
});
