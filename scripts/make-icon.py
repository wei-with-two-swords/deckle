"""Generate the Deckle app icon (PNG + ICO) with a blue gradient and a white D."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

SIZE = 1024
SS = 2
W = SIZE * SS
RADIUS = int(220 * SS)

# Diagonal gradient from #007aff to #7fc9ff.
xs = np.linspace(0.0, 1.0, W, dtype=np.float32)[None, :]
ys = np.linspace(0.0, 1.0, W, dtype=np.float32)[:, None]
t = np.clip((xs + ys) / 2.0, 0.0, 1.0)
start = np.array([0x00, 0x7A, 0xFF], dtype=np.float32)
end = np.array([0x7F, 0xC9, 0xFF], dtype=np.float32)
rgb = (start[None, None, :] * (1 - t[..., None]) + end[None, None, :] * t[..., None]).astype(
    np.uint8
)
icon = Image.fromarray(rgb, mode="RGB").convert("RGBA")

mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, W - 1), radius=RADIUS, fill=255)
icon.putalpha(mask)

draw = ImageDraw.Draw(icon)
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", int(660 * SS))
text = "D"
box = draw.textbbox((0, 0), text, font=font)
tw, th = box[2] - box[0], box[3] - box[1]
x = (W - tw) / 2 - box[0]
y = (W - th) / 2 - box[1] - int(18 * SS)
draw.text((x, y), text, font=font, fill=(255, 255, 255, 255))

# A small baseline dot, like a cursor.
dot_r = int(46 * SS)
cx, cy = int(W * 0.70), int(W * 0.73)
draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=(255, 255, 255, 200))

icon = icon.resize((SIZE, SIZE), Image.LANCZOS)
icon.save(ASSETS / "icon.png")
icon.save(
    ASSETS / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("wrote", ASSETS / "icon.png", ASSETS / "icon.ico")
