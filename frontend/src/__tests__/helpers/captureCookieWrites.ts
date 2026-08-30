/**
 * Records every `document.cookie = ...` while still performing it.
 *
 * Reading `document.cookie` back gives name/value pairs and nothing else, so
 * attributes — `Secure`, `SameSite`, `max-age` — are only observable at the
 * moment they are written.
 */
export function captureCookieWrites(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (!descriptor?.get || !descriptor.set) throw new Error("document.cookie is not an accessor here");
  const { get, set } = descriptor;

  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => get.call(document) as string,
    set: (value: string) => {
      writes.push(value);
      set.call(document, value);
    },
  });

  return { writes, restore: () => Reflect.deleteProperty(document, "cookie") };
}
