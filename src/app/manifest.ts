import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

// Optional PWA: the app works fully in the browser; installing is never required.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    start_url: "/events",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f7f4ee",
    theme_color: "#12614f",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
