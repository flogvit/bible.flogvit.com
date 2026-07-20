/**
 * Client-safe verse template parser
 * Does NOT import any server-side code (no database access)
 */

export interface VerseTemplate {
  type: 'text' | 'verse';
  content: string;
  refString?: string; // Raw reference string like "matt 6,9-13"
}

/**
 * Parse text containing {{reference}} templates
 * Example: "Jesus sa: {{matt 6,9-13}}" becomes:
 * [
 *   { type: 'text', content: 'Jesus sa: ' },
 *   { type: 'verse', content: 'matt 6,9-13', refString: 'matt 6,9-13' }
 * ]
 */
export function parseVerseTemplate(text: string): VerseTemplate[] {
  const parts: VerseTemplate[] = [];
  const pattern = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const refText = match[1]!.trim();
    parts.push({
      type: 'verse',
      content: refText,
      refString: refText,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  return parts;
}

/**
 * Check if text contains any {{reference}} templates
 */
export function hasVerseTemplates(text: string): boolean {
  return /\{\{[^}]+\}\}/.test(text);
}

/**
 * Extract all raw reference strings from text
 */
export function extractRefStrings(text: string): string[] {
  const parts = parseVerseTemplate(text);
  return parts
    .filter((p): p is VerseTemplate & { refString: string } =>
      p.type === 'verse' && p.refString !== undefined
    )
    .map(p => p.refString);
}
