/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // System-driven, not a manual toggle: there is no in-app light/dark switch,
  // so `dark:` classes should just track the OS `prefers-color-scheme`
  // (what `useColorScheme()` reads) rather than needing something to ever
  // stamp a `dark` class onto a root view.
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        'primary-red': '#D4380D',
        'shakti-purple': '#722ED1',
        saffron: '#FA8C16',
        'forest-green': '#389E0D',
        'off-white': '#F5F5F5',
        ink: '#141414',
        stone: '#595959',
        'error-red': '#CF1322',
        'near-black': '#0A0A0A',
        charcoal: '#1A1A1A',
        'disabled-bg': '#E5E5E5',
        'disabled-text': '#595959',
        'dark-border': '#2A2A2A',
        // `stone` above is a flat color, not Tailwind's default numbered
        // `stone-*` scale, so a secondary dark-mode text tone needs its own
        // named token rather than e.g. `stone-400`.
        'dark-text-secondary': '#9CA3AF',
      },
      fontFamily: {
        // Android-only fallback so Devanagari text (hi/mr) never renders as
        // boxes/tofu on system fonts that lack full Devanagari coverage.
        // iOS is untouched — its system font already covers Devanagari.
        'devanagari-regular': ['NotoSansDevanagari_400Regular'],
        'devanagari-semibold': ['NotoSansDevanagari_600SemiBold'],
        'devanagari-bold': ['NotoSansDevanagari_700Bold'],
      },
    },
  },
  plugins: [],
};
