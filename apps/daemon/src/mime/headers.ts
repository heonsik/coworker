import type { EmailAddress } from '@accomplish_ai/agent-core';
import { decodeMimeHeader } from './decode.js';

export interface ParsedHeaders {
  /** Lower-cased header name → raw (un-decoded) value, last one wins. */
  map: Map<string, string>;
  get(name: string): string | undefined;
}

/** Splits a raw RFC 822 message into its header block and body. */
export function splitHeadersAndBody(raw: string): { headerBlock: string; body: string } {
  const match = raw.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return { headerBlock: raw, body: '' };
  }
  return {
    headerBlock: raw.slice(0, match.index),
    body: raw.slice(match.index + match[0].length),
  };
}

/** Parses a header block, unfolding continuation lines (leading whitespace). */
export function parseHeaders(headerBlock: string): ParsedHeaders {
  const map = new Map<string, string>();
  const lines = headerBlock.split(/\r?\n/);
  let current: { name: string; value: string } | null = null;

  const commit = () => {
    if (current) {
      map.set(current.name.toLowerCase(), current.value.trim());
    }
  };

  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current.value += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) {
      continue;
    }
    commit();
    current = { name: line.slice(0, colon).trim(), value: line.slice(colon + 1) };
  }
  commit();

  return { map, get: (name: string) => map.get(name.toLowerCase()) };
}

export interface ContentType {
  type: string;
  boundary?: string;
  charset?: string;
  name?: string;
}

/** Parses a `Content-Type` value into its mime type and relevant parameters. */
export function parseContentType(value?: string): ContentType {
  if (!value) {
    return { type: 'text/plain' };
  }
  const [rawType, ...paramParts] = value.split(';');
  const params = new Map<string, string>();
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq < 0) {
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = part
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
    params.set(key, val);
  }
  return {
    type: rawType.trim().toLowerCase() || 'text/plain',
    boundary: params.get('boundary'),
    charset: params.get('charset'),
    name: params.get('name'),
  };
}

/** Extracts a filename from `Content-Disposition` or `Content-Type` name. */
export function parseFilename(disposition?: string, fallbackName?: string): string | undefined {
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:"([^"]+)"|([^;]+))/i);
    const raw = match?.[1] ?? match?.[2];
    if (raw) {
      return decodeMimeHeader(raw.trim());
    }
  }
  return fallbackName ? decodeMimeHeader(fallbackName) : undefined;
}

/** Parses an address-list header (`To`, `Cc`, `From`) into structured entries. */
export function parseAddressList(value?: string): EmailAddress[] {
  if (!value) {
    return [];
  }
  const results: EmailAddress[] = [];
  // Split on commas that are not inside quotes or angle brackets.
  const parts = value.match(/(?:"[^"]*"|<[^>]*>|[^,])+/g) ?? [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const angle = trimmed.match(/<([^>]+)>/);
    if (angle) {
      const name = trimmed
        .slice(0, angle.index)
        .trim()
        .replace(/^"(.*)"$/, '$1');
      results.push({
        address: angle[1].trim(),
        name: name ? decodeMimeHeader(name) : undefined,
      });
    } else {
      results.push({ address: trimmed.replace(/^"(.*)"$/, '$1') });
    }
  }
  return results;
}
