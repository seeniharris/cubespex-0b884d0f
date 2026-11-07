import { createFileRoute } from "@tanstack/react-router";
import { CubeSpex } from "@/components/cube/CubeSpex";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CubeSpex — Speedcubing Timer" },
      {
        name: "description",
        content:
          "Competition-style speedcubing timer with WCA inspection, official scrambles, Ao5/Ao12 stats and sessions.",
      },
      { property: "og:title", content: "CubeSpex — Speedcubing Timer" },
      {
        property: "og:description",
        content:
          "Stackmat-style timer with WCA inspection, scrambles for every event, and trimmed averages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CubeSpex,
});
