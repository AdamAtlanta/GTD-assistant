import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Executive Assistant",
    short_name: "EA",
    description: "A focused GTD dashboard for tasks, calendar review, inbox triage, and Keep notes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4ef",
    theme_color: "#46585b",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
