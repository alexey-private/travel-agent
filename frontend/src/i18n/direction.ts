/**
 * Logical properties mirror boxes, never glyphs. An icon that carries a
 * direction — a back arrow, a chevron pointing at the panel it opens — keeps
 * pointing the same way in a right-to-left layout, where it then reads as its
 * opposite. Apply this to those icons, and only to those: an icon that means
 * the same thing in both directions (a downward chevron, a spinner) must not
 * be flipped.
 */
export const MIRROR_UNDER_RTL = "rtl:-scale-x-100";
