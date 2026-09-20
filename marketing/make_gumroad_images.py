from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

# Brand palette (matches index.html / home.html :root exactly)
BG = (11, 21, 18)
BG_ELEV = (19, 32, 25)
BORDER = (31, 50, 38)
ACCENT = (34, 197, 94)
ACCENT_DARK = (22, 153, 74)
ACCENT_TEXT = (6, 43, 20)
TEXT = (234, 242, 236)
TEXT_DIM = (157, 179, 166)
TEXT_FAINT = (103, 133, 119)
POS = (74, 222, 128)
NEG = (255, 107, 107)

FONT_DIR = "C:/Windows/Fonts/"

def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)

def rounded_gradient_square(size, c1, c2):
    """Diagonal gradient rounded square (matches CSS linear-gradient(160deg, accent, accent-dark))."""
    img = Image.new("RGB", (size, size), c1)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = ((x / size) * 0.35 + (y / size) * 0.65)
            t = max(0, min(1, t))
            r = int(c1[0] + (c2[0]-c1[0]) * t)
            g = int(c1[1] + (c2[1]-c1[1]) * t)
            b = int(c1[2] + (c2[2]-c1[2]) * t)
            px[x, y] = (r, g, b)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    radius = int(size * 0.28)
    mdraw.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0,0,0,0))
    out.paste(img, (0,0), mask)
    return out

def draw_vignette(base, cx, cy, radius, color, strength=60):
    glow = Image.new("RGBA", base.size, (0,0,0,0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=color+(strength,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius//2))
    base.paste(Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB"), (0,0))

def logomark(size):
    sq = rounded_gradient_square(size, ACCENT, ACCENT_DARK)
    draw = ImageDraw.Draw(sq)
    f = font("segoeuib.ttf", int(size*0.56))
    txt = "$"
    bbox = draw.textbbox((0,0), txt, font=f)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    draw.text((size/2 - tw/2 - bbox[0], size/2 - th/2 - bbox[1]), txt, font=f, fill=ACCENT_TEXT)
    return sq

def rounded_card(w, h, radius, fill, outline=None, outline_width=1):
    card = Image.new("RGBA", (w, h), (0,0,0,0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([0,0,w-1,h-1], radius=radius, fill=fill, outline=outline, width=outline_width)
    return card

# ============================================================
# THUMBNAIL — 800x800 square (Gumroad library/grid image)
# ============================================================
TH = 800
thumb = Image.new("RGB", (TH, TH), BG)
draw_vignette(thumb, TH//2, int(TH*0.42), 380, ACCENT, strength=34)
draw = ImageDraw.Draw(thumb)

mark_size = 300
mark = logomark(mark_size)
thumb.paste(mark, (TH//2 - mark_size//2, 150), mark)

f_title = font("segoeuib.ttf", 64)
title = "Expense Tracker"
bbox = draw.textbbox((0,0), title, font=f_title)
tw = bbox[2]-bbox[0]
draw.text((TH/2 - tw/2 - bbox[0], 500), title, font=f_title, fill=TEXT)

f_tag = font("segoeui.ttf", 30)
tag = "Weekly budgeting, done right"
bbox = draw.textbbox((0,0), tag, font=f_tag)
tw = bbox[2]-bbox[0]
draw.text((TH/2 - tw/2 - bbox[0], 585), tag, font=f_tag, fill=TEXT_FAINT)

thumb.save("gumroad_thumbnail.png")
print("Saved gumroad_thumbnail.png", thumb.size)

# ============================================================
# COVER — 1600x900 landscape (main product page hero image)
# ============================================================
CW, CH = 1600, 900
cover = Image.new("RGB", (CW, CH), BG)
draw_vignette(cover, int(CW*0.22), int(CH*0.5), 480, ACCENT, strength=30)
draw_vignette(cover, int(CW*0.86), int(CH*0.25), 260, ACCENT, strength=18)
draw = ImageDraw.Draw(cover)

margin = 90
voffset = 68

# Logomark + wordmark, top-left
lm_size = 76
lm = logomark(lm_size)
cover.paste(lm, (margin, 96 + voffset), lm)
f_brand = font("segoeuib.ttf", 40)
draw.text((margin + lm_size + 20, 96 + voffset + lm_size/2 - 24), "Expense Tracker", font=f_brand, fill=TEXT)

# Headline
f_h1 = font("segoeuib.ttf", 58)
lines = ["Know exactly where", "your money stands,", "every Friday."]
y = 250 + voffset
for line in lines:
    draw.text((margin, y), line, font=f_h1, fill=TEXT)
    y += 68

# Tagline
f_lede = font("segoeui.ttf", 26)
lede_lines = [
    "A budget tracker built around how money actually moves —",
    "weekly pay, real bills, and one clear monthly picture.",
]
y += 14
for line in lede_lines:
    draw.text((margin, y), line, font=f_lede, fill=TEXT_DIM)
    y += 36

# Feature pills
f_pill = font("segoeuib.ttf", 20)
pills = ["Calendar + spreadsheet", "Private & offline", "Win / Mac / Linux"]
px = margin
py = y + 26
for p in pills:
    bbox = draw.textbbox((0,0), p, font=f_pill)
    pw = bbox[2]-bbox[0]
    pad_x, pad_y = 18, 10
    box_w, box_h = pw + pad_x*2, 40
    pill_img = rounded_card(box_w, box_h, box_h//2, BG_ELEV, outline=BORDER, outline_width=1)
    cover.paste(pill_img, (px, py), pill_img)
    draw.text((px + pad_x, py + pad_y - 2), p, font=f_pill, fill=ACCENT)
    px += box_w + 14

# Mock balance card, right side
card_w, card_h = 460, 430
card_x, card_y = CW - margin - card_w, (CH - card_h)//2 + voffset//2
card = rounded_card(card_w, card_h, 22, BG_ELEV, outline=BORDER, outline_width=2)
cover.paste(card, (card_x, card_y), card)

cdraw = ImageDraw.Draw(cover)
pad = 28
tile_gap = 14
tile_w = (card_w - pad*2 - tile_gap) // 2
tile_h = 96

def draw_tile(x, y, label, value, color):
    tile = rounded_card(tile_w, tile_h, 14, BG, outline=None)
    cover.paste(tile, (x, y), tile)
    f_lbl = font("segoeui.ttf", 16)
    f_val = font("segoeuib.ttf", 26)
    lb = cdraw.textbbox((0,0), label, font=f_lbl)
    cdraw.text((x + tile_w/2 - (lb[2]-lb[0])/2 - lb[0], y + 16), label, font=f_lbl, fill=TEXT_FAINT)
    vb = cdraw.textbbox((0,0), value, font=f_val)
    cdraw.text((x + tile_w/2 - (vb[2]-vb[0])/2 - vb[0], y + 44), value, font=f_val, fill=color)

tx, ty = card_x + pad, card_y + pad
draw_tile(tx, ty, "CHECKING", "$11,747", TEXT)
draw_tile(tx + tile_w + tile_gap, ty, "SAVINGS", "$34,132", TEXT)
ty2 = ty + tile_h + tile_gap
draw_tile(tx, ty2, "CREDIT CARD", "-$3,045", NEG)
draw_tile(tx + tile_w + tile_gap, ty2, "OTHER BANK", "$1,100", TEXT)

# total bar
total_y = ty2 + tile_h + tile_gap
total_h = 96
total_tile = rounded_card(card_w - pad*2, total_h, 14, BG, outline=BORDER, outline_width=1)
cover.paste(total_tile, (tx, total_y), total_tile)
f_lbl = font("segoeui.ttf", 16)
f_val = font("segoeuib.ttf", 30)
cdraw.text((tx + 20, total_y + 18), "TOTAL", font=f_lbl, fill=TEXT_FAINT)
val = "$43,934"
vb = cdraw.textbbox((0,0), val, font=f_val)
cdraw.text((tx + (card_w-pad*2) - (vb[2]-vb[0]) - 20, total_y + 40), val, font=f_val, fill=POS)

foot = "Every account added together — debts subtract automatically."
f_foot = font("segoeui.ttf", 14)
cdraw.text((tx, total_y + total_h + 16), foot, font=f_foot, fill=TEXT_FAINT)

cover.save("gumroad_cover.png")
print("Saved gumroad_cover.png", cover.size)
