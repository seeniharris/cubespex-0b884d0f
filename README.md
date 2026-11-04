# CubeSpex

Build a polished, fully functional, real-world speedcubing timer web app called "CubeTime" inspired by competition timers (Stackmat / csTimer), not a generic stopwatch. It must work beautifully on mobile and desktop, be installable/PWA-ready if supported, and persist data locally with localStorage (no login/backend required).

CORE TIMER:
- Large centered digital timer with hundredths, precise monotonic timing (performance.now), no interval drift; update display smoothly.
- Start/stop using Spacebar on desktop and large touch controls on mobile. Standard speedcubing interaction: hold Space to arm, show ready state after configurable hold delay, release to start; press Space again to stop. On mobile, use a clear touch-and-hold start pad with equivalent arming behavior; prevent page scrolling/selection while timing.
- WCA inspection mode toggle: 15-second inspection countdown with audible/visual 8s and 12s warnings; apply +2 when inspection exceeds 15 seconds but is under 17 seconds, DNF at 17 seconds or more. Make penalties visible and editable. Allow inspection off.
- Keyboard shortcuts, pause-free accurate solve timing, reset/cancel inspection safely, focus handling, prevent accidental key repeat.
- New scramble shown prominently before each solve; generate event-appropriate scrambles for 2x2, 3x3, 4x4, 5x5, 6x6, 7x7, 3BLD, OH, FMC, Clock, Megaminx, Pyraminx, Skewb, Square-1 where feasible. Use a reputable cubing scramble library such as cubing.js / equivalent; do not pretend random strings are valid scrambles. If a specific event is unsupported by the chosen library, clearly label the fallback as a practice scramble and keep the app honest. Add scramble refresh button and copy.
- Event selector with 3x3 default and per-event sessions.

SOLVE MANAGEMENT / STATS:
- Save every solve automatically with date/time, event, scramble, raw time, penalty (+2 / DNF / none), and final result.
- Session history list with newest first, selectable solve details, edit time, toggle penalty, delete individual solve, undo last delete, clear session with confirmation.
- Stats: solve count, best single, current single, mean, best Ao5, current Ao5, best Ao12, current Ao12; correctly compute WCA-style trimmed averages (drop best and worst for Ao5; for Ao12 drop best and worst), DNF handling, and show -- when insufficient solves. Clearly distinguish mean from trimmed average.
- Trend chart for recent solves, plus session summary and personal best highlights.
- Multiple named sessions per event, create/rename/switch sessions.
- Manual time entry, +2 and DNF controls after solve, penalty adjustment.
- Export/import all sessions and solves as JSON; export CSV for spreadsheet analysis. Include robust import validation and avoid overwriting without confirmation.

UX / DESIGN:
- Competition-grade, minimal, high-contrast dark interface with a crisp lime accent, clean typography, subtle borders, no clutter. Large legible timer, responsive layout.
- Main screen hierarchy: event/session controls, scramble, timer, stats, solve history. On small screens prioritize scramble and timer; stats/history accessible via tabs or collapsible sections.
- Include settings for inspection, hold-to-start delay, timer precision/display, sound effects, theme (dark/light), and confirmation preferences.
- Optional sound cues for ready/start/inspection warnings/stop; use Web Audio synthesized tones, no external audio.
- Accessibility: keyboard navigation, visible focus, reduced-motion support, sufficient contrast, ARIA labels.
- Add a first-run quick guide showing how to use the timer and shortcuts.
- Handle refresh/reopen without losing saved data; show empty states and helpful errors.
- Do not add authentication, payments, ads, or unrelated AI features.
- Thoroughly test the timer state machine, penalty boundaries, averages, persistence, and mobile touch behavior. Build actual working functionality, not just a visual mockup.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bff08e32-10b3-4556-93f2-3455cd8eb757).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
