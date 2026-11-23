/**
 * Central product identity. Change name, colors and contact here only;
 * nothing else in the app hard-codes the brand.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "دعوتي",
  tagline: "دعوات مناسباتك عبر واتساب، وردود ضيوفك في مكان واحد",
  logoEmoji: "✉️",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  defaultTimezone: "Asia/Riyadh",
  defaultCountry: "SA" as const,
} as const;
