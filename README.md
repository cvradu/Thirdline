# Thirdline

A desktop app for designing animated lower thirds and exporting them with a transparent background.

- **Text:** title and subtitle lines, 12 bundled fonts (Inter, Montserrat, Poppins, Oswald, Anton, Bebas Neue, Playfair Display and more), system fonts, or upload your own `.ttf/.otf/.woff/.woff2` (uploaded fonts are remembered).
- **Backdrop:** 9 shapes (rectangle, rounded, pill, slanted, box + accent bar, two-tone stack, underline, side bar, corner brackets) with gradient, opacity, padding, shadow, or upload a PNG/JPG/SVG image backdrop.
- **Animation:** separate in and out animations for backdrop, title and subtitle (18 backdrop animations, 21 text animations including per-letter and per-word reveals, typewriter and mask reveals), 20 easing curves plus a draggable custom bezier.
- **Timing:** duration, frame rate, per-layer start/end; a timeline you can drag to retime layers; play, loop, frame-step and scrub.
- **Layout:** resolutions from 720p to 4K plus vertical/square, drag to position with snapping to title-safe and action-safe guides, quick-place buttons, anchors so the box grows in the right direction.
- **Layers:** click the backdrop, title or subtitle in the preview (or the layer buttons / timeline labels) to jump straight to its controls. Double-click text to edit it. Tab cycles layers, Esc deselects.
- **Alignment:** left, center, right or justified (letters spread to fill the box).
- **Presets:** 7 built-in styles, save your own, import/share preset files. Undo/redo and autosave.
- **Export (ffmpeg is bundled):** MOV ProRes 4444 with alpha, WebM VP9 with alpha, PNG sequence with alpha, MP4 H.264 over a solid colour.

## Run it

Requires Node.js 18+.

```bash
npm install
npm start
```

## Build an installer

```bash
npm run dist:mac     # .dmg   (run on a Mac)
npm run dist:win     # .exe   (run on Windows)
npm run dist:linux   # .AppImage
```

Each platform build must run on that platform, because `ffmpeg-static` downloads the ffmpeg binary for the machine running `npm install`. The included GitHub Actions workflow (`.github/workflows/build.yml`) builds all three when you push a `v*` tag or run it manually. Builds are unsigned: on macOS, right-click the app and choose Open the first time.

## Keyboard shortcuts

Space play/pause · ←/→ step a frame · Home go to start · Cmd/Ctrl+Z undo · Cmd/Ctrl+Shift+Z redo · Cmd/Ctrl+S save preset · Cmd/Ctrl+E export · hold Alt while dragging to disable snapping.

## Project layout

- `main.js`: Electron main process: dialogs, preset/font storage, ffmpeg export pipeline (raw RGBA frames are piped to ffmpeg).
- `preload.js`: the small API the UI is allowed to call.
- `src/engine.js`: the renderer. One function draws any frame at any time, used by both preview and export, so exports match the preview exactly.
- `src/easing.js`, `src/presets.js`, `src/app.js`: easing curves, default/built-in styles, and the editor UI.
- `test/electron-test.js`: headless end-to-end test that exports every format (`xvfb-run npx electron --no-sandbox test/electron-test.js` on Linux).

## Licences

App code: MIT. Bundled fonts: SIL Open Font License 1.1 (see `src/fonts/LICENSE.txt`). ffmpeg is distributed under the GPL via `ffmpeg-static`.
