"""
Generate extension icons (16x16, 48x48, 128x128) as solid-blue PNG files.
No pip install required — uses only Python built-ins.

Usage:
    cd apps/extension/icons
    python create_icons.py
"""
import struct
import zlib
import os

# Freelancer OS primary blue: #1A56DB = rgb(26, 86, 219)
R, G, B = 26, 86, 219


def make_png(width: int, height: int, r: int, g: int, b: int) -> bytes:
    """Create a minimal solid-colour PNG using raw bytes (no dependencies)."""

    def chunk(name: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", crc)

    # IHDR: width, height, bit_depth=8, color_type=2 (RGB), compress=0, filter=0, interlace=0
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))

    # IDAT: one scanline per row, each starting with a filter byte of 0
    row = bytes([0]) + bytes([r, g, b] * width)
    raw = row * height
    idat = chunk(b"IDAT", zlib.compress(raw, 9))

    iend = chunk(b"IEND", b"")

    return b"\x89PNG\r\n\x1a\n" + ihdr + idat + iend


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for size in (16, 48, 128):
        path = os.path.join(script_dir, f"icon{size}.png")
        data = make_png(size, size, R, G, B)
        with open(path, "wb") as f:
            f.write(data)
        print(f"  Created {path}  ({len(data)} bytes)")
    print("Icons generated successfully.")
