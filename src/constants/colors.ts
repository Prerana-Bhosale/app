export const COLORS = {
  PRIMARY_RED: '#D4380D',
  SHAKTI_PURPLE: '#722ED1',
  SAFFRON: '#FA8C16',
  FOREST_GREEN: '#389E0D',
  OFF_WHITE: '#F5F5F5',
  WHITE: '#FFFFFF',
  DEEP_INK: '#141414',
  STONE: '#595959',
  ERROR_RED: '#CF1322',
  NEAR_BLACK: '#0A0A0A',
  CHARCOAL: '#1A1A1A',
  DISABLED_BG: '#E5E5E5',
  DISABLED_TEXT: '#595959',
  // Dark mode additions — brand colors (red/purple/saffron/green) are
  // unchanged in dark mode; they stay high-contrast on a dark background.
  DARK_BORDER: '#2A2A2A',
  DARK_TEXT_PRIMARY: '#F5F5F5',
  DARK_TEXT_SECONDARY: '#9CA3AF',
} as const;

export type ColorKey = keyof typeof COLORS;
