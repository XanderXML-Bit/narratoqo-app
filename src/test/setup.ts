import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch globally
(globalThis as unknown as { fetch: typeof fetch }).fetch = vi.fn();

// Mock URL.createObjectURL
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock atob for base64 decoding - use a simple implementation that works in Node
globalThis.atob = vi.fn((str: string) => {
  // Simple base64 decode for testing
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(
          Uint8Array.from(
            str
              .replace(/-/g, '+')
              .replace(/_/g, '/')
              .split('')
              .map((c) => c.charCodeAt(0)),
            (byte) => {
              const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
              return base64Chars.indexOf(String.fromCharCode(byte));
            }
          ),
          (byte: number) => '%' + ('00' + byte.toString(16)).slice(-2)
        )
        .join('')
    );
  } catch {
    return str;
  }
});
