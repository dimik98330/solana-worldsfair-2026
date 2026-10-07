export const PROPOSAL_TITLE_MAX_BYTES = 96;

/** Matches the program's UTF-8 byte limit, after the same trim used by the submitted title. */
export function proposalTitleError(value: string): string | null {
  const title = value.trim();
  if (!title) return 'Enter a proposal title.';
  const bytes = new TextEncoder().encode(title).byteLength;
  if (bytes > PROPOSAL_TITLE_MAX_BYTES) return `Use a shorter title. Maximum ${PROPOSAL_TITLE_MAX_BYTES} UTF-8 bytes; this title uses ${bytes}. Non-English characters may use more than one byte.`;
  return null;
}
