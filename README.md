# Thirdline

A desktop app for designing animated lower thirds and exporting them with a transparent background.

- **Text:** title and subtitle lines, 12 bundled fonts (Inter, Montserrat, Poppins, Oswald, Anton, Bebas Neue, Playfair Display and more), system fonts, or upload your own `.ttf/.otf/.woff/.woff2` (uploaded fonts are remembered).
- **Backdrop:** 9 shapes (rectangle, rounded, pill, slanted, box + accent bar, two-tone stack, underline, side bar, corner brackets) with gradient, opacity, padding, shadow, or upload a PNG/JPG/SVG image backdrop.
- **Animation:** separate in and out animations for backdrop, title and subtitle (18 backdrop animations, 21 text animations including per-letter and per-word reveals, typewriter and mask reveals), 20 easing curves plus a draggable custom bezier.
- **Timing:** duration, frame rate, per-layer start/end; a timeline you can drag to retime layers; play, loop, frame-step and scrub.
- **Layout:** resolutions from 720p to 4K plus vertical/square, drag to position with snapping to title-safe and action-safe guides, quick-place buttons, anchors so the box grows in the right direction.
- **Layers:** click the backdrop, title or subtitle in the preview (or the layer buttons / timeline labels) to jump straight to its controls. Double-click text to edit it. Tab cycles layers, Esc deselects.
- **Alignment:** left, center, right or justified (letters spread to fill the box).
- **Projects:** Save / Open `.l3rd` project files (File menu, Cmd+S / Cmd+O). Projects embed uploaded fonts and images, so they open identically on another computer. Double-click a `.l3rd` file to open it.
- **Gradients:** solid, linear, radial or 4-point backdrop fills, with animated looks (rotate, flow, shimmer, pulse, orbit, swirl, breathe) and sample gradients.
- **Texture overlay:** upload an image (or use a built-in grain/paper/halftone/scanline/stripe/metal texture) and blend it onto the backdrop with 14 blend modes; it is clipped to the backdrop's shape and can drift over time.
- **Colours:** every colour has a picker, hex field, swatches, recently used colours and a screen eyedropper.
- **Advanced mode:** keyframe position, scale, rotation, opacity, blur and tracking per layer, plus most style values (size, colours, padding, gradient settings…). Keyframes appear on the timeline directly under the layer they belong to (fold a layer's rows with ▾), where you can drag them, change their easing or delete them (J/K jump between keyframes). The preset in/out animations show as ◆ pairs on each layer bar: click one to change its type, duration or easing, drag it to retime, press Delete to remove it, or **Convert to keyframes** (fade, slide, scale, pop, blur, grow-from-centre) to edit it key by key.
- **Masks:** per-layer rectangle/ellipse masks with feather, rounded corners and invert; keyframe them or use the quick wipe/rise/iris reveal presets.
- **Text animators:** After Effects-style animators on the title and subtitle. A range selector (start / end / offset / amount, by characters or words, with square/ramp/triangle/round/smooth shapes) drives position, scale, rotation, opacity, blur, tracking and fill colour per letter. Presets (fade, rise, drop, pop, blur words, tracking, colour sweep, wave) add the keyframes for you.
- **Motion blur:** shutter angle and quality settings; rendered with floating-point accumulation on export, optional preview.
- **Presets / styles:** 7 built-in styles, save your own, import/share preset files. Undo/redo and autosave.
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
