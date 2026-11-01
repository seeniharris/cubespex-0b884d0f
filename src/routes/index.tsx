import { createFileRoute } from "@tanstack/react-router";
import { CubeTime } from "@/components/cube/CubeTime";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CubeTime — Speedcubing Timer" },
      { name: "description", content: "Competition-style speedcubing timer with WCA inspection, official scrambles, Ao5/Ao12 stats and sessions." },
      { property: "og:title", content: "CubeTime — Speedcubing Timer" },
      { property: "og:description", content: "Stackmat-style timer with WCA inspection, scrambles for every event, and trimmed averages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CubeTime,
});
