/**
 * Editorial rules enforced by the validator (SPEC.md §4.8, §6).
 * The owner may edit these lists; keep them lowercase.
 */

/** Loaded adjectives and phrases that must not appear in titles or summaries. */
export const BANNED_WORDS: readonly string[] = [
  "brazen",
  "massive",
  "shocking",
  "outrageous",
  "egregious",
  "scandalous",
  "blatant",
  "greedy",
  "crooked",
  "notorious",
  "disgraced",
  "ripped off",
  "rip off",
  "ripping off",
  "caught",
  "busted",
];

/**
 * Status statements that must not appear in summaries. Status is rendered from
 * data so that prose cannot go stale after a plea, acquittal, or pardon.
 */
export const BANNED_STATUS_PHRASES: readonly string[] = [
  "pleaded guilty",
  "pled guilty",
  "was convicted",
  "were convicted",
  "found guilty",
  "was acquitted",
  "were acquitted",
  "was sentenced",
  "were sentenced",
  "was dismissed",
  "were dismissed",
  "was pardoned",
  "were pardoned",
  "was overturned",
  "has been charged",
  "have been charged",
  "remains pending",
  "is pending",
  "awaits trial",
  "awaiting trial",
  "is the defendant",
  "are the defendants",
  "is a defendant",
  "are defendants",
  "remains charged",
  "faces up to",
  "face up to",
];
