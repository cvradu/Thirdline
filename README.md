# Thirdline

A desktop app for designing animated lower thirds and exporting them with a transparent background.

The app has two modes. **Easy** walks you through three steps (pick a style, type your text, choose how it moves) with no animation knowledge needed, and still lets you pick the in/out animation of the backdrop, title and subtitle separately and fine-tune sizes and spacing. **Advanced** gives animators layers, keyframes, a graph editor and a timeline.

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
- **Anchor points and parenting:** each layer has an anchor point (the crosshair in the preview) that it scales and rotates from. Drag it, use the 9-point picker, or type Anchor X/Y; the layer stays put while you move it. Set **Parent** on any layer (e.g. the title and subtitle to the backdrop) and it follows that layer's position, rotation and scale, like parenting in After Effects. Hold **Shift** while dragging in the preview to lock the move to one axis.
- **Selecting several keyframes:** Shift-click keyframes, or drag a box around them on the timeline, then drag them together, change their easing in one go or delete them.
- **Brand kits:** Brand ▾ in the top bar saves your colours, fonts and logo; pick a kit to apply it, and while it's on every style in the gallery uses it.
- **Timeline zoom:** Alt/Option + scroll (or pinch) zooms the timeline around the mouse, Shift + scroll pans, double-click the ruler to fit.
- **Copy, paste, duplicate:** Cmd/Ctrl+C / V / D on keyframes (they paste at the playhead, onto the selected layer if it has the same property) and on layers (a copy of the title or subtitle becomes a new text layer).
- **Align and distribute:** Shift-click layers in the list or the preview, then use the Align buttons in the Transform section (one layer aligns to the backdrop, several to each other, or pick "Video frame"). Dragging one of several selected layers moves them all.
- **Motion path:** a layer with position keyframes shows the path it travels in the preview, a dot per frame and a square per keyframe; drag a square to move that keyframe.
- **Groups:** Cmd/Ctrl+G groups the selected layers (Shift+Cmd/Ctrl+G ungroups). Everything in a group moves, scales, rotates, fades and animates with it, including the group's own In/Out animation.
- **While on screen:** pulse, float, drift, breathe or wiggle during the hold so long lower thirds don't look frozen (per layer in Advanced, for the whole design in Easy).
- **Vertical and square versions:** tick 9:16 and/or 1:1 in Export to get extra files with the design re-placed and sized for that frame.
- **Panels:** drag the edges of the side panels and the timeline to resize them, drag a panel's ⋮⋮ grip to swap the side panels or put the timeline above the preview. File > Reset panel layout (or View > Reset Panel Layout) puts everything back.
- **Easing menu and graph editor:** right-click any keyframe or preset ramp to pick its easing. Double-click it (or press **Graph…**) to open the graph editor and drag the bezier handles to shape the value curve, with the speed curve shown underneath, like After Effects.
- **Masks:** per-layer rectangle/ellipse masks with feather, rounded corners and invert; keyframe them or use the quick wipe/rise/iris reveal presets.
- **Text animators:** After Effects-style animators on the title and subtitle. A range selector (start / end / offset / amount, by characters or words, with square/ramp/triangle/round/smooth shapes) drives position, scale, rotation, opacity, blur, tracking and fill colour per letter. Presets (fade, rise, drop, pop, blur words, tracking, colour sweep, wave) add the keyframes for you.
- **Motion blur:** shutter angle and quality settings; rendered with floating-point accumulation on export, optional preview.
- **Presets / styles:** 7 built-in styles, save your own, import/share preset files. Undo/redo and autosave.
- **More layers (Advanced):** add extra text lines, a logo image, accent bars and other shapes. Drag layers in the list to reorder them, and use the eye to hide one.
- **Text styling:** tracking, line height, outline (stroke), glow, drop shadow, and auto-fit so long names shrink to fit a maximum width.
- **Hold and loop:** in Easy mode, drag the In / Hold / Out bar to set how long the graphic stays on screen.
- **Preview over footage:** choose "Preview on" > your own video or image (or drop one on the preview) to see the lower third over real footage. Footage is never exported.
- **Templates and batch export:** File > Batch export. Load a CSV of names and titles, match columns to text layers, and render one file per row.
- **Export presets:** pick "Made for" Premiere Pro, DaVinci Resolve, Final Cut Pro or the web, and the format and settings are set for you. (For an editable Premiere template, use Export as .mogrt below.)
- **Export as .mogrt (via After Effects):** File > Export as .mogrt. Thirdline opens After Effects, starts a new project (After Effects asks to save the one that's open), rebuilds the lower third as a native comp and asks where to save; it then saves the `.aep` and exports the `.mogrt` next to it. Title and subtitle text, colours and logos become Essential Graphics controls, the backdrop keeps wrapping the text when an editor retypes it, and the in/out animations are protected so Premiere stretches only the hold. Animation runs through expressions that use Thirdline's own timing and easing, so it moves like the preview. Thirdline can also install the fonts the design uses. Needs After Effects 2018 or newer (2024+ recommended for font matching); textures and animated gradients are not carried over, and shadow, glow and blur softness are close approximations.
- **Live output for OBS:** press Go live, then add `http://127.0.0.1:7461/live` as a Browser Source in OBS. Trigger it with the In / Out buttons, or from a Stream Deck / Companion with HTTP calls to `/cue/in`, `/cue/out`, `/cue/toggle`.
- **Updates:** the app checks GitHub for a new release on start and shows an "Update" pill that downloads the new installer.
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
