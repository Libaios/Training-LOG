"""Génère les icônes de l'appli (barres montantes bleu / jaune / clair sur fond encre)."""
from PIL import Image, ImageDraw

INK = (21, 32, 43)
BLUE = (42, 85, 204)
YELLOW = (242, 183, 5)
LIGHT = (230, 235, 241)

def draw(size: int, safe: float, rounded: bool) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGB", (s, s), INK)
    d = ImageDraw.Draw(img)
    if rounded:
        img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=INK)
    inner = s * safe
    off = (s - inner) / 2
    bar_w = inner * 0.2
    gap = inner * 0.1
    total = 3 * bar_w + 2 * gap
    x0 = off + (inner - total) / 2
    base = off + inner * 0.86
    heights = [0.34, 0.54, 0.74]
    colors = [BLUE, YELLOW, LIGHT]
    for i, (h, c) in enumerate(zip(heights, colors)):
        x = x0 + i * (bar_w + gap)
        d.rounded_rectangle([x, base - inner * h, x + bar_w, base], radius=int(bar_w * 0.28), fill=c)
    return img.resize((size, size), Image.LANCZOS)

draw(192, 0.78, False).save("public/icon-192.png")
draw(512, 0.78, False).save("public/icon-512.png")
draw(512, 0.62, False).save("public/icon-maskable-512.png")
draw(180, 0.78, False).save("public/apple-touch-icon.png")
