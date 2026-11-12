#!/usr/bin/env python3
"""
Generates the application icon set from code.

Requires Python 3 and Pillow. The generated files are committed so a normal
build does not need Python:

    python3 scripts/generate-icons.py

Outputs:
  resources/icon.png          1024x1024 master (Linux, dock, window icon)
  resources/icons/*.png       multi-size Linux icon set
  resources/icon.ico          Windows icon
  resources/icon.icns         macOS icon
  src/renderer/public/icon.png  browser-preview favicon
"""
from io import BytesIO
from pathlib import Path
import struct

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / 'resources'
ICONS = RESOURCES / 'icons'
PUBLIC = ROOT / 'src' / 'renderer' / 'public'
SIZE = 1024

INK_TOP = (48, 43, 37)
INK_BOTTOM = (27, 25, 22)
CREAM = (251, 248, 241)
ACCENT = (179, 84, 47)
ACCENT_LIGHT = (217, 120, 79)
BORDER = (66, 59, 50)

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/noto/NotoSerifDisplay-Black.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
]


def rounded_mask(size: int, radius: int, inset: int = 0) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=radius,
        fill=255,
    )
    return mask


def build_master() -> Image.Image:
    # Vertical warm-ink gradient clipped to a rounded square.
    background = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    gradient = Image.new('RGB', (1, SIZE))
    pixels = gradient.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        pixels[0, y] = tuple(
            round(INK_TOP[i] + (INK_BOTTOM[i] - INK_TOP[i]) * t) for i in range(3)
        )
    gradient = gradient.resize((SIZE, SIZE))
    background.paste(gradient, (0, 0), rounded_mask(SIZE, 230))

    draw = ImageDraw.Draw(background)
    draw.rounded_rectangle(
        (14, 14, SIZE - 15, SIZE - 15),
        radius=218,
        outline=BORDER,
        width=5,
    )

    # Serif C, the same monogram as the header.
    font = None
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            font = ImageFont.truetype(candidate, 648)
            break
    if font is None:
        raise SystemExit('No serif font found; install DejaVu Serif or Noto Serif Display.')

    text = 'C'
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = (SIZE - (right - left)) / 2 - left - 24
    y = (SIZE - (bottom - top)) / 2 - top - 30
    draw.text((x, y), text, font=font, fill=CREAM)

    # Terracotta cursor/period after the C: a small editor mark.
    draw.rounded_rectangle((684, 714, 806, 836), radius=34, fill=ACCENT)
    draw.rounded_rectangle((700, 730, 790, 820), radius=24, fill=ACCENT_LIGHT)

    return background


def save_pngs(master: Image.Image) -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    master.save(RESOURCES / 'icon.png', 'PNG')
    for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            ICONS / f'{size}x{size}.png', 'PNG'
        )
    master.resize((256, 256), Image.Resampling.LANCZOS).save(PUBLIC / 'icon.png', 'PNG')


def save_ico(master: Image.Image) -> None:
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(RESOURCES / 'icon.ico', 'ICO', sizes=sizes)


def png_bytes(image: Image.Image, size: int) -> bytes:
    buffer = BytesIO()
    image.resize((size, size), Image.Resampling.LANCZOS).save(buffer, 'PNG')
    return buffer.getvalue()


def save_icns(master: Image.Image) -> None:
    # PNG-backed ICNS entries understood by modern macOS versions.
    entries = [
        ('icp4', 16),
        ('icp5', 32),
        ('icp6', 64),
        ('ic07', 128),
        ('ic08', 256),
        ('ic09', 512),
        ('ic10', 1024),
        ('ic11', 32),
        ('ic12', 64),
        ('ic13', 256),
        ('ic14', 512),
    ]
    body = bytearray()
    for kind, size in entries:
        data = png_bytes(master, size)
        body += kind.encode('ascii') + struct.pack('>I', len(data) + 8) + data
    length = 8 + len(body)
    data = b'icns' + struct.pack('>I', length) + bytes(body)
    (RESOURCES / 'icon.icns').write_bytes(data)


if __name__ == '__main__':
    master = build_master()
    save_pngs(master)
    save_ico(master)
    save_icns(master)
    print('Generated resources/icon.png, resources/icon.ico, resources/icon.icns')
    print('and resources/icons/*.png')
