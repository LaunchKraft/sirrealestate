export const LOCALES = ["de", "en", "fr", "es", "ar"] as const;
export type LocaleOption = (typeof LOCALES)[number];

export const THEME_OPTIONS = {
  PURPLE: "theme-purple",
  BLUE: "theme-blue",
  GREEN: "theme-green",
  ORANGE: "theme-orange",
} as const;

export type ThemeVariant = (typeof THEME_OPTIONS)[keyof typeof THEME_OPTIONS];

export type ModeVariant = (typeof THEME_MODE_OPTIONS)[number];
export const THEME_MODE_OPTIONS = ["light", "dark", "system"] as const;

const storagePrefix = import.meta.env.VITE_STORAGE_PREFIX || "";
export const COOKIE_KEYS = { locale: `${storagePrefix}-locale` };

export const LOCAL_STORAGE_KEYS = {
  themeColor: `${storagePrefix}-theme-color`,
  themeMode: `${storagePrefix}-theme-mode`,
  leftMenuType: `${storagePrefix}-left-menu-type`,
  contentType: `${storagePrefix}-content-type`,
};

export const LINKS = {
  figma:
    "https://www.figma.com/design/qyKY88Q8MPvp2Q8uTmvW3k/prod-gogo-design-7.7.0?node-id=9242-145711&t=7MQRlH4jZhxrprhy-4",
  purchase: "https://1.envato.market/k4z0",
  purchase_extended: "https://1.envato.market/LKA6W0",
  docs: "/docs/welcome/introduction",
  view: "/auth/sign-in",
  signup: "/auth/sign-in",
  login: "/auth/sign-up",
  components: "/ui",
} as const;
