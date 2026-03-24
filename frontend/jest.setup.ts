import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";
import { webcrypto } from "crypto";
import { ReadableStream } from "stream/web";

// Polyfill TextEncoder / TextDecoder (missing from older jsdom versions)
global.TextEncoder = TextEncoder as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Polyfill Web Crypto API (needed for crypto.randomUUID)
Object.defineProperty(global, "crypto", { value: webcrypto, configurable: true });

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Expose Node.js Web Streams API (jsdom suppresses global ReadableStream)
Object.defineProperty(global, "ReadableStream", { value: ReadableStream, configurable: true });
