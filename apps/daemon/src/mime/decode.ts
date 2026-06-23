/**
 * Self-contained MIME content decoders. POP3 hands us raw RFC 822 bytes; these
 * helpers undo content-transfer-encodings and map declared charsets onto UTF-8
 * so stored bodies and headers are human-readable regardless of the sender.
 */

/** Decodes a `quoted-printable` payload into raw bytes. */
export function decodeQuotedPrintable(data: string): Buffer {
  // Soft line breaks (`=` at end of line) are removed before hex decoding.
  const normalized = data.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '=' && i + 2 < normalized.length) {
      const hex = normalized.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(char.charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes);
}

/** Decodes a `base64` payload, tolerating embedded whitespace/newlines. */
export function decodeBase64(data: string): Buffer {
  return Buffer.from(data.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
}

function normalizeCharset(charset?: string): string {
  if (!charset) {
    return 'utf-8';
  }
  const lower = charset.trim().toLowerCase().replace(/['"]/g, '');
  // Common aliases TextDecoder accepts directly; ks_c_5601 → euc-kr for Korean
  // company mail, which is the motivating case for POP3 support here.
  if (lower === 'ks_c_5601-1987' || lower === 'ksc5601' || lower === 'ks_c_5601') {
    return 'euc-kr';
  }
  if (lower === 'utf8') {
    return 'utf-8';
  }
  return lower;
}

/** Decodes a byte buffer to a string using the declared charset (UTF-8 fallback). */
export function decodeCharset(buffer: Buffer, charset?: string): string {
  const normalized = normalizeCharset(charset);
  try {
    return new TextDecoder(normalized, { fatal: false }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    } catch {
      return buffer.toString('latin1');
    }
  }
}

/**
 * Decodes RFC 2047 encoded-words (`=?charset?B|Q?text?=`) found in headers such
 * as Subject and From. Untouched runs are returned as-is.
 */
export function decodeMimeHeader(value: string): string {
  if (!value.includes('=?')) {
    return value;
  }
  const encodedWord = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;
  // Whitespace between two adjacent encoded-words is not significant and should
  // be dropped per RFC 2047; collapse it before decoding each word.
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(encodedWord, (_match, charset: string, encoding: string, text: string) => {
      const upper = encoding.toUpperCase();
      const bytes =
        upper === 'B' ? decodeBase64(text) : decodeQuotedPrintable(text.replace(/_/g, ' '));
      return decodeCharset(bytes, charset);
    });
}
