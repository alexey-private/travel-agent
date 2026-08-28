import { errorKeyFor } from "@/lib/errorCode";
import { DICTIONARIES } from "@/i18n/dictionaries";

describe("errorKeyFor", () => {
  it("converts the backend's snake_case code to a dictionary key", () => {
    expect(errorKeyFor("drive_not_configured", "errors.exportFailed")).toBe("errors.driveNotConfigured");
  });

  it("passes a single-word code through unchanged", () => {
    expect(errorKeyFor("unknown", "errors.exportFailed")).toBe("errors.unknown");
  });

  it("converts every underscore, not just the first", () => {
    expect(errorKeyFor("apple_credentials_required", "errors.exportFailed")).toBe("errors.appleCredentialsRequired");
  });

  it("falls back when the response carries no code", () => {
    expect(errorKeyFor(undefined, "errors.connectAppleFailed")).toBe("errors.connectAppleFailed");
  });

  /**
   * The backend names more failures than the UI can show. An unnamed one must read
   * as the generic message, not as a raw key printed on screen.
   */
  it("falls back for a code no dictionary entry covers", () => {
    expect(errorKeyFor("invalid_calendar_provider", "errors.saveSettingsFailed")).toBe("errors.saveSettingsFailed");
  });

  it("resolves to a key every locale actually translates", () => {
    const key = errorKeyFor("apple_invalid_credentials", "errors.connectAppleFailed");
    for (const locale of ["en", "he", "ru"] as const) {
      expect(typeof DICTIONARIES[locale][key]).toBe("string");
    }
  });
});
