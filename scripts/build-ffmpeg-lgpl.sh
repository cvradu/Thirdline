#!/usr/bin/env bash
# Builds a static, LGPL-only ffmpeg for macOS (arm64 or x86_64) with what Thirdline needs:
#   ProRes (prores_ks + prores_videotoolbox), VP9 with alpha (libvpx, BSD), PNG, H.264 via
#   Apple's VideoToolbox (no libx264, which is GPL). Runs on an Apple Silicon Mac / macos-14 runner;
#   x86_64 is cross-compiled.
#
#   scripts/build-ffmpeg-lgpl.sh arm64|x86_64 OUTPUT_PATH
set -euo pipefail
ARCH="${1:?arch: arm64 or x86_64}"
OUT="${2:?output path for the ffmpeg binary}"
FFMPEG_VERSION="${FFMPEG_VERSION:-7.1.1}"
LIBVPX_VERSION="${LIBVPX_VERSION:-1.15.0}"
WORK="${WORK:-$(mktemp -d)}"
PREFIX="$WORK/prefix-$ARCH"
JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
case "$ARCH" in
  arm64) MIN=11.0; VPX_TARGET=arm64-darwin20-gcc; FF_ARCH=aarch64 ;;
  x86_64) MIN=10.15; VPX_TARGET=x86_64-darwin20-gcc; FF_ARCH=x86_64 ;;
  *) echo "unknown arch $ARCH" >&2; exit 1 ;;
esac
export MACOSX_DEPLOYMENT_TARGET="$MIN"
CFLAGS_ARCH="-arch $ARCH -mmacosx-version-min=$MIN"
mkdir -p "$WORK" "$PREFIX"
cd "$WORK"

echo "== libvpx $LIBVPX_VERSION ($ARCH)"
[ -d "libvpx-$LIBVPX_VERSION" ] || curl -fsSL "https://github.com/webmproject/libvpx/archive/refs/tags/v$LIBVPX_VERSION.tar.gz" | tar xz
rm -rf "build-vpx-$ARCH" && mkdir "build-vpx-$ARCH" && cd "build-vpx-$ARCH"
CFLAGS="$CFLAGS_ARCH" CXXFLAGS="$CFLAGS_ARCH" LDFLAGS="$CFLAGS_ARCH" "../libvpx-$LIBVPX_VERSION/configure" \
  --target="$VPX_TARGET" --prefix="$PREFIX" \
  --enable-static --disable-shared --enable-pic --enable-vp9-highbitdepth \
  --disable-examples --disable-tools --disable-docs --disable-unit-tests
make -j"$JOBS" && make install
cd "$WORK"

echo "== ffmpeg $FFMPEG_VERSION ($ARCH)"
[ -d "ffmpeg-$FFMPEG_VERSION" ] || curl -fsSL "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" | tar xJ
rm -rf "build-ff-$ARCH" && mkdir "build-ff-$ARCH" && cd "build-ff-$ARCH"
CROSS=()
[ "$ARCH" != "$(uname -m)" ] && CROSS=(--enable-cross-compile --target-os=darwin)
PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" "../ffmpeg-$FFMPEG_VERSION/configure" \
  --prefix="$PREFIX" --arch="$FF_ARCH" "${CROSS[@]}" \
  --cc="clang" --extra-cflags="$CFLAGS_ARCH -I$PREFIX/include" --extra-ldflags="$CFLAGS_ARCH -L$PREFIX/lib" \
  --pkg-config-flags=--static \
  --enable-static --disable-shared --disable-autodetect \
  --disable-doc --disable-ffplay --disable-ffprobe --disable-network --disable-debug \
  --enable-videotoolbox --enable-zlib --enable-libvpx
make -j"$JOBS"
mkdir -p "$(dirname "$OUT")"
cp ffmpeg "$OUT"
strip "$OUT" || true

echo "== check"
file "$OUT"
otool -L "$OUT"
# Only system libraries and frameworks may be linked dynamically.
if otool -L "$OUT" | tail -n +2 | grep -vE '^\s*(/usr/lib/|/System/Library/)'; then echo "unexpected dynamic library" >&2; exit 1; fi
if [ "$ARCH" = "$(uname -m)" ]; then
  "$OUT" -hide_banner -L | head -5
  "$OUT" -hide_banner -L | grep -q "Lesser General Public" || { echo "not an LGPL build" >&2; exit 1; }
  ENC="$("$OUT" -hide_banner -encoders)"
  for e in prores_ks prores_videotoolbox h264_videotoolbox libvpx-vp9 png; do echo "$ENC" | grep -q " $e " || { echo "missing encoder $e" >&2; exit 1; }; done
  if echo "$ENC" | grep -q " libx264 "; then echo "libx264 must not be in an LGPL build" >&2; exit 1; fi
fi
echo "built $OUT"
