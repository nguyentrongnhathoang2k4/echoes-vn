"""
Script tao sprite sheet pixel art chi tiet, tinh xao cho AN va MIEN.
Kich thuoc: 192x288 px (luoi 3x3: 64x96 px moi frame).
3 huong: Down (hang 0), Up (hang 1), Right (hang 2, lat ngang cho Left).
3 frames moi huong: Walk 1, Idle, Walk 2.
"""
from PIL import Image, ImageDraw

FRAME_W = 64
FRAME_H = 96
COLS = 3
ROWS = 3

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def hex_to_rgba(h, a=255):
    return hex_to_rgb(h) + (a,)

# =============================================================================
# COLOR PALETTES
# =============================================================================
PALETTE_AN = {
    'skin_hi': hex_to_rgba('#ffede6'),
    'skin': hex_to_rgba('#f7d5c8'),
    'skin_shadow': hex_to_rgba('#e2b3a0'),
    'skin_deep': hex_to_rgba('#be8b77'),
    'hair_hi': hex_to_rgba('#38394a'),
    'hair': hex_to_rgba('#21222e'),
    'hair_shadow': hex_to_rgba('#14141d'),
    'hair_line': hex_to_rgba('#0a0a0f'),
    'hoodie_hi': hex_to_rgba('#424555'),
    'hoodie': hex_to_rgba('#2b2c37'),
    'hoodie_shadow': hex_to_rgba('#1c1d25'),
    'hoodie_deep': hex_to_rgba('#111218'),
    'string': hex_to_rgba('#e2e8f0'),
    'pants_hi': hex_to_rgba('#333845'),
    'pants': hex_to_rgba('#1f232c'),
    'pants_shadow': hex_to_rgba('#12151c'),
    'shoe_sole': hex_to_rgba('#e4e4ec'),
    'shoe_body': hex_to_rgba('#1e1d24'),
    'eye_sclera': hex_to_rgba('#f1f5f9'),
    'eye_iris': hex_to_rgba('#242330'),
    'eye_pupil': hex_to_rgba('#0d0c12'),
    'eye_bag': hex_to_rgba('#a28392'),
}

PALETTE_MIEN = {
    'skin_hi': hex_to_rgba('#fff5f2'),
    'skin': hex_to_rgba('#fce4dd'),
    'skin_shadow': hex_to_rgba('#f0c2b5'),
    'blush': hex_to_rgba('#fca5a5', 180),
    'hair_hi': hex_to_rgba('#f5b8db'),
    'hair_mid': hex_to_rgba('#db78b3'),
    'hair': hex_to_rgba('#b34f8e'),
    'hair_shadow': hex_to_rgba('#832f65'),
    'hair_line': hex_to_rgba('#4c173a'),
    'sweater_hi': hex_to_rgba('#f5d0fe'),
    'sweater': hex_to_rgba('#d946ef'),
    'sweater_rib': hex_to_rgba('#fae8ff'),
    'sweater_shadow': hex_to_rgba('#a21caf'),
    'sweater_deep': hex_to_rgba('#701a75'),
    'skirt_hi': hex_to_rgba('#6b21a8'),
    'skirt': hex_to_rgba('#3b0764'),
    'skirt_shadow': hex_to_rgba('#20023a'),
    'sock': hex_to_rgba('#fae8ff'),
    'boot_hi': hex_to_rgba('#7e22ce'),
    'boot': hex_to_rgba('#4a044e'),
    'eye_lash': hex_to_rgba('#3b0764'),
    'eye_pupil': hex_to_rgba('#1e0538'),
    'eye_top': hex_to_rgba('#7e22ce'),
    'eye_bot': hex_to_rgba('#c084fc'),
    'eye_sparkle': hex_to_rgba('#ffffff'),
}

def p(draw, ox, oy, x, y, w, h, c):
    draw.rectangle([ox + x, oy + y, ox + x + w - 1, oy + y + h - 1], fill=c)

# =============================================================================
# DRAW AN
# =============================================================================
def draw_an(draw, frame_idx, dir_name, ox, oy):
    C = PALETTE_AN
    # frame_idx: 0=StepLeft, 1=Idle, 2=StepRight
    bob = 1 if frame_idx in (0, 2) else 0

    if dir_name == 'down':
        # --- FRONT VIEW ---
        # 1. Hair Back base
        p(draw, ox, oy, 18, 16 + bob, 28, 22, C['hair_shadow'])
        p(draw, ox, oy, 16, 20 + bob, 32, 16, C['hair_shadow'])

        # 2. Legs & Shoes
        if frame_idx == 1: # Idle
            p(draw, ox, oy, 23, 68, 8, 14, C['pants'])
            p(draw, ox, oy, 33, 68, 8, 14, C['pants'])
            p(draw, ox, oy, 22, 82, 9, 6, C['shoe_body'])
            p(draw, ox, oy, 22, 86, 9, 2, C['shoe_sole'])
            p(draw, ox, oy, 33, 82, 9, 6, C['shoe_body'])
            p(draw, ox, oy, 33, 86, 9, 2, C['shoe_sole'])
        elif frame_idx == 0: # Step Left
            p(draw, ox, oy, 21, 67, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 34, 68, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 20, 80, 10, 6, C['shoe_body'])
            p(draw, ox, oy, 20, 84, 10, 2, C['shoe_sole'])
            p(draw, ox, oy, 35, 83, 8, 5, C['shoe_body'])
            p(draw, ox, oy, 35, 86, 8, 2, C['shoe_sole'])
        else: # Step Right
            p(draw, ox, oy, 22, 68, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 35, 67, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 21, 83, 8, 5, C['shoe_body'])
            p(draw, ox, oy, 21, 86, 8, 2, C['shoe_sole'])
            p(draw, ox, oy, 34, 80, 10, 6, C['shoe_body'])
            p(draw, ox, oy, 34, 84, 10, 2, C['shoe_sole'])

        # 3. Hoodie Body
        p(draw, ox, oy, 19, 44 + bob, 26, 25, C['hoodie'])
        # Highlights & Shadows on hoodie
        p(draw, ox, oy, 20, 44 + bob, 24, 2, C['hoodie_hi'])
        p(draw, ox, oy, 19, 66 + bob, 26, 3, C['hoodie_deep'])
        # Kangaroo Pocket
        p(draw, ox, oy, 24, 56 + bob, 16, 9, C['hoodie_shadow'])
        p(draw, ox, oy, 25, 55 + bob, 14, 1, C['hoodie_hi'])
        # Drawstrings
        p(draw, ox, oy, 28, 48 + bob, 2, 7, C['string'])
        p(draw, ox, oy, 34, 48 + bob, 2, 7, C['string'])

        # 4. Arms
        arm_l_y = 45 + bob + (2 if frame_idx == 0 else -1 if frame_idx == 2 else 0)
        arm_r_y = 45 + bob + (-1 if frame_idx == 0 else 2 if frame_idx == 2 else 0)
        p(draw, ox, oy, 15, arm_l_y, 5, 18, C['hoodie_shadow'])
        p(draw, ox, oy, 44, arm_r_y, 5, 18, C['hoodie_shadow'])
        # Hands
        p(draw, ox, oy, 15, arm_l_y + 18, 5, 4, C['skin_shadow'])
        p(draw, ox, oy, 44, arm_r_y + 18, 5, 4, C['skin_shadow'])

        # 5. Head & Face
        # Neck
        p(draw, ox, oy, 28, 38 + bob, 8, 7, C['skin_deep'])
        # Jaw & Face
        p(draw, ox, oy, 20, 22 + bob, 24, 18, C['skin'])
        p(draw, ox, oy, 22, 38 + bob, 20, 3, C['skin_shadow'])
        p(draw, ox, oy, 25, 40 + bob, 14, 2, C['skin_deep'])

        # Eyes & Bags
        # Eyebags (dark circles)
        p(draw, ox, oy, 23, 33 + bob, 6, 2, C['eye_bag'])
        p(draw, ox, oy, 35, 33 + bob, 6, 2, C['eye_bag'])
        # Sclera
        p(draw, ox, oy, 23, 29 + bob, 6, 4, C['eye_sclera'])
        p(draw, ox, oy, 35, 29 + bob, 6, 4, C['eye_sclera'])
        # Irises
        p(draw, ox, oy, 24, 30 + bob, 4, 3, C['eye_iris'])
        p(draw, ox, oy, 36, 30 + bob, 4, 3, C['eye_iris'])
        p(draw, ox, oy, 25, 30 + bob, 2, 2, C['eye_pupil'])
        p(draw, ox, oy, 37, 30 + bob, 2, 2, C['eye_pupil'])
        # Eyebrows (tired straight)
        p(draw, ox, oy, 22, 27 + bob, 7, 2, C['hair_shadow'])
        p(draw, ox, oy, 35, 27 + bob, 7, 2, C['hair_shadow'])
        # Nose & Mouth
        p(draw, ox, oy, 31, 35 + bob, 2, 2, C['skin_shadow'])
        p(draw, ox, oy, 29, 38 + bob, 6, 1, C['skin_deep'])

        # 6. Hair Front (Bangs & Locks)
        p(draw, ox, oy, 18, 14 + bob, 28, 12, C['hair'])
        p(draw, ox, oy, 20, 12 + bob, 24, 3, C['hair_hi'])
        # Layered bangs falling over forehead
        p(draw, ox, oy, 17, 20 + bob, 6, 11, C['hair'])
        p(draw, ox, oy, 41, 20 + bob, 6, 11, C['hair'])
        p(draw, ox, oy, 22, 22 + bob, 5, 6, C['hair'])
        p(draw, ox, oy, 28, 22 + bob, 7, 7, C['hair'])
        p(draw, ox, oy, 36, 22 + bob, 6, 6, C['hair'])

    elif dir_name == 'up':
        # --- BACK VIEW ---
        # Legs & Shoes
        if frame_idx == 1:
            p(draw, ox, oy, 23, 68, 8, 14, C['pants'])
            p(draw, ox, oy, 33, 68, 8, 14, C['pants'])
            p(draw, ox, oy, 23, 82, 8, 6, C['shoe_body'])
            p(draw, ox, oy, 23, 86, 8, 2, C['shoe_sole'])
            p(draw, ox, oy, 33, 82, 8, 6, C['shoe_body'])
            p(draw, ox, oy, 33, 86, 8, 2, C['shoe_sole'])
        elif frame_idx == 0:
            p(draw, ox, oy, 21, 67, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 34, 68, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 21, 80, 8, 6, C['shoe_body'])
            p(draw, ox, oy, 21, 84, 8, 2, C['shoe_sole'])
            p(draw, ox, oy, 34, 83, 8, 5, C['shoe_body'])
            p(draw, ox, oy, 34, 86, 8, 2, C['shoe_sole'])
        else:
            p(draw, ox, oy, 22, 68, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 35, 67, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 22, 83, 8, 5, C['shoe_body'])
            p(draw, ox, oy, 22, 86, 8, 2, C['shoe_sole'])
            p(draw, ox, oy, 35, 80, 8, 6, C['shoe_body'])
            p(draw, ox, oy, 35, 84, 8, 2, C['shoe_sole'])

        # Hoodie Back
        p(draw, ox, oy, 19, 44 + bob, 26, 25, C['hoodie'])
        p(draw, ox, oy, 19, 66 + bob, 26, 3, C['hoodie_deep'])
        # Hood lying on back
        p(draw, ox, oy, 24, 44 + bob, 16, 12, C['hoodie_shadow'])
        p(draw, ox, oy, 26, 45 + bob, 12, 9, C['hoodie_deep'])

        # Arms
        arm_l_y = 45 + bob + (2 if frame_idx == 0 else -1 if frame_idx == 2 else 0)
        arm_r_y = 45 + bob + (-1 if frame_idx == 0 else 2 if frame_idx == 2 else 0)
        p(draw, ox, oy, 15, arm_l_y, 5, 20, C['hoodie_shadow'])
        p(draw, ox, oy, 44, arm_r_y, 5, 20, C['hoodie_shadow'])

        # Back of Head / Full Hair
        p(draw, ox, oy, 18, 14 + bob, 28, 28, C['hair'])
        p(draw, ox, oy, 20, 12 + bob, 24, 4, C['hair_hi'])
        p(draw, ox, oy, 16, 22 + bob, 32, 18, C['hair_shadow'])
        p(draw, ox, oy, 19, 36 + bob, 26, 6, C['hair_line'])

    else: # right
        # --- SIDE VIEW (FACING RIGHT) ---
        # Legs
        if frame_idx == 1:
            p(draw, ox, oy, 27, 68, 10, 14, C['pants'])
            p(draw, ox, oy, 27, 82, 13, 6, C['shoe_body'])
            p(draw, ox, oy, 27, 86, 13, 2, C['shoe_sole'])
        elif frame_idx == 0:
            p(draw, ox, oy, 24, 67, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 23, 81, 10, 6, C['shoe_body'])
            p(draw, ox, oy, 23, 85, 10, 2, C['shoe_sole'])
            p(draw, ox, oy, 32, 69, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 32, 82, 12, 6, C['shoe_body'])
            p(draw, ox, oy, 32, 86, 12, 2, C['shoe_sole'])
        else:
            p(draw, ox, oy, 24, 69, 8, 13, C['pants_hi'])
            p(draw, ox, oy, 24, 82, 12, 6, C['shoe_body'])
            p(draw, ox, oy, 24, 86, 12, 2, C['shoe_sole'])
            p(draw, ox, oy, 32, 67, 8, 14, C['pants_shadow'])
            p(draw, ox, oy, 33, 81, 10, 6, C['shoe_body'])
            p(draw, ox, oy, 33, 85, 10, 2, C['shoe_sole'])

        # Torso & Arm
        p(draw, ox, oy, 24, 44 + bob, 17, 25, C['hoodie'])
        p(draw, ox, oy, 24, 66 + bob, 17, 3, C['hoodie_deep'])
        # Side arm
        swing = 2 if frame_idx == 0 else -2 if frame_idx == 2 else 0
        p(draw, ox, oy, 28 + swing, 46 + bob, 7, 18, C['hoodie_shadow'])
        p(draw, ox, oy, 29 + swing, 64 + bob, 5, 4, C['skin_shadow'])

        # Head profile
        p(draw, ox, oy, 25, 20 + bob, 17, 21, C['skin'])
        # Nose & Profile
        p(draw, ox, oy, 40, 31 + bob, 3, 3, C['skin'])
        # Eye profile
        p(draw, ox, oy, 35, 29 + bob, 4, 4, C['eye_sclera'])
        p(draw, ox, oy, 37, 29 + bob, 2, 4, C['eye_iris'])
        p(draw, ox, oy, 34, 33 + bob, 5, 2, C['eye_bag'])

        # Hair profile
        p(draw, ox, oy, 20, 14 + bob, 22, 18, C['hair'])
        p(draw, ox, oy, 22, 12 + bob, 18, 4, C['hair_hi'])
        p(draw, ox, oy, 18, 22 + bob, 8, 18, C['hair_shadow'])
        # Front bangs overhang
        p(draw, ox, oy, 36, 18 + bob, 6, 10, C['hair'])

# =============================================================================
# DRAW MIEN
# =============================================================================
def draw_mien(draw, frame_idx, dir_name, ox, oy):
    C = PALETTE_MIEN
    bob = 1 if frame_idx in (0, 2) else 0

    if dir_name == 'down':
        # --- FRONT VIEW ---
        # 1. Hair back (flowing behind shoulders)
        p(draw, ox, oy, 16, 18 + bob, 32, 28, C['hair_shadow'])
        p(draw, ox, oy, 14, 28 + bob, 36, 16, C['hair_line'])

        # 2. Legs & Boots
        if frame_idx == 1:
            p(draw, ox, oy, 24, 70, 6, 12, C['skin'])
            p(draw, ox, oy, 34, 70, 6, 12, C['skin'])
            # Socks
            p(draw, ox, oy, 24, 78, 6, 3, C['sock'])
            p(draw, ox, oy, 34, 78, 6, 3, C['sock'])
            # Boots
            p(draw, ox, oy, 23, 81, 8, 7, C['boot'])
            p(draw, ox, oy, 33, 81, 8, 7, C['boot'])
        elif frame_idx == 0:
            p(draw, ox, oy, 22, 69, 6, 11, C['skin'])
            p(draw, ox, oy, 35, 71, 6, 13, C['skin_shadow'])
            p(draw, ox, oy, 22, 77, 6, 3, C['sock'])
            p(draw, ox, oy, 35, 80, 6, 3, C['sock'])
            p(draw, ox, oy, 21, 80, 8, 7, C['boot'])
            p(draw, ox, oy, 35, 83, 7, 5, C['boot'])
        else:
            p(draw, ox, oy, 23, 71, 6, 13, C['skin_shadow'])
            p(draw, ox, oy, 36, 69, 6, 11, C['skin'])
            p(draw, ox, oy, 23, 80, 6, 3, C['sock'])
            p(draw, ox, oy, 36, 77, 6, 3, C['sock'])
            p(draw, ox, oy, 22, 83, 7, 5, C['boot'])
            p(draw, ox, oy, 35, 80, 8, 7, C['boot'])

        # 3. Pleated Skirt
        p(draw, ox, oy, 21, 60 + bob, 22, 11, C['skirt'])
        p(draw, ox, oy, 19, 68 + bob, 26, 4, C['skirt_hi'])
        # Pleat vertical shadows
        for pl in (24, 28, 32, 36, 40):
            p(draw, ox, oy, pl, 62 + bob, 1, 9, C['skirt_shadow'])

        # 4. Turtleneck Sweater (Cozy knit)
        # Body
        p(draw, ox, oy, 20, 42 + bob, 24, 20, C['sweater'])
        p(draw, ox, oy, 22, 42 + bob, 20, 2, C['sweater_hi'])
        # Knit ribbed lines
        p(draw, ox, oy, 20, 48 + bob, 24, 3, C['sweater_rib'])
        p(draw, ox, oy, 20, 58 + bob, 24, 3, C['sweater_shadow'])
        # High Turtleneck collar
        p(draw, ox, oy, 26, 37 + bob, 12, 6, C['sweater_hi'])
        p(draw, ox, oy, 27, 41 + bob, 10, 2, C['sweater_shadow'])

        # Arms
        arm_l_y = 43 + bob + (2 if frame_idx == 0 else -1 if frame_idx == 2 else 0)
        arm_r_y = 43 + bob + (-1 if frame_idx == 0 else 2 if frame_idx == 2 else 0)
        p(draw, ox, oy, 16, arm_l_y, 5, 17, C['sweater_shadow'])
        p(draw, ox, oy, 43, arm_r_y, 5, 17, C['sweater_shadow'])
        # Dainty hands
        p(draw, ox, oy, 17, arm_l_y + 17, 4, 3, C['skin'])
        p(draw, ox, oy, 43, arm_r_y + 17, 4, 3, C['skin'])

        # 5. Face & Anime Eyes
        p(draw, ox, oy, 21, 20 + bob, 22, 18, C['skin'])
        p(draw, ox, oy, 25, 36 + bob, 14, 2, C['skin_shadow'])
        # Sweet anime blush
        p(draw, ox, oy, 22, 31 + bob, 4, 2, C['blush'])
        p(draw, ox, oy, 38, 31 + bob, 4, 2, C['blush'])

        # Anime Eyes (Purple Gradient & Sparkles)
        # Left eye
        p(draw, ox, oy, 23, 26 + bob, 6, 2, C['eye_lash'])
        p(draw, ox, oy, 24, 28 + bob, 5, 4, C['eye_top'])
        p(draw, ox, oy, 24, 30 + bob, 5, 2, C['eye_bot'])
        p(draw, ox, oy, 26, 28 + bob, 2, 3, C['eye_pupil'])
        p(draw, ox, oy, 24, 28 + bob, 2, 2, C['eye_sparkle'])
        # Right eye
        p(draw, ox, oy, 35, 26 + bob, 6, 2, C['eye_lash'])
        p(draw, ox, oy, 35, 28 + bob, 5, 4, C['eye_top'])
        p(draw, ox, oy, 35, 30 + bob, 5, 2, C['eye_bot'])
        p(draw, ox, oy, 36, 28 + bob, 2, 3, C['eye_pupil'])
        p(draw, ox, oy, 35, 28 + bob, 2, 2, C['eye_sparkle'])

        # Cute small nose & gentle smile
        p(draw, ox, oy, 31, 32 + bob, 2, 1, C['skin_shadow'])
        p(draw, ox, oy, 30, 34 + bob, 4, 1, C['hair_shadow'])

        # 6. Hair Front (Soft bangs & side locks framing face)
        p(draw, ox, oy, 19, 13 + bob, 26, 11, C['hair'])
        p(draw, ox, oy, 21, 11 + bob, 22, 3, C['hair_hi'])
        # Soft anime bangs
        p(draw, ox, oy, 22, 20 + bob, 20, 4, C['hair'])
        p(draw, ox, oy, 25, 23 + bob, 4, 3, C['hair_shadow'])
        p(draw, ox, oy, 33, 23 + bob, 4, 3, C['hair_shadow'])
        # Long side locks framing cheeks
        p(draw, ox, oy, 18, 20 + bob, 4, 20, C['hair'])
        p(draw, ox, oy, 42, 20 + bob, 4, 20, C['hair'])
        p(draw, ox, oy, 19, 36 + bob, 2, 6, C['hair_mid'])
        p(draw, ox, oy, 43, 36 + bob, 2, 6, C['hair_mid'])

    elif dir_name == 'up':
        # --- BACK VIEW ---
        # Legs & Boots
        if frame_idx == 1:
            p(draw, ox, oy, 24, 70, 6, 12, C['skin'])
            p(draw, ox, oy, 34, 70, 6, 12, C['skin'])
            p(draw, ox, oy, 24, 78, 6, 3, C['sock'])
            p(draw, ox, oy, 34, 78, 6, 3, C['sock'])
            p(draw, ox, oy, 23, 81, 8, 7, C['boot'])
            p(draw, ox, oy, 33, 81, 8, 7, C['boot'])
        elif frame_idx == 0:
            p(draw, ox, oy, 22, 69, 6, 11, C['skin'])
            p(draw, ox, oy, 35, 71, 6, 13, C['skin_shadow'])
            p(draw, ox, oy, 22, 77, 6, 3, C['sock'])
            p(draw, ox, oy, 35, 80, 6, 3, C['sock'])
            p(draw, ox, oy, 21, 80, 8, 7, C['boot'])
            p(draw, ox, oy, 35, 83, 7, 5, C['boot'])
        else:
            p(draw, ox, oy, 23, 71, 6, 13, C['skin_shadow'])
            p(draw, ox, oy, 36, 69, 6, 11, C['skin'])
            p(draw, ox, oy, 23, 80, 6, 3, C['sock'])
            p(draw, ox, oy, 36, 77, 6, 3, C['sock'])
            p(draw, ox, oy, 22, 83, 7, 5, C['boot'])
            p(draw, ox, oy, 35, 80, 8, 7, C['boot'])

        # Skirt
        p(draw, ox, oy, 21, 60 + bob, 22, 11, C['skirt'])
        p(draw, ox, oy, 19, 68 + bob, 26, 4, C['skirt_hi'])

        # Sweater back
        p(draw, ox, oy, 20, 42 + bob, 24, 20, C['sweater'])
        p(draw, ox, oy, 20, 48 + bob, 24, 3, C['sweater_rib'])

        # Arms
        arm_l_y = 43 + bob + (2 if frame_idx == 0 else -1 if frame_idx == 2 else 0)
        arm_r_y = 43 + bob + (-1 if frame_idx == 0 else 2 if frame_idx == 2 else 0)
        p(draw, ox, oy, 16, arm_l_y, 5, 18, C['sweater_shadow'])
        p(draw, ox, oy, 43, arm_r_y, 5, 18, C['sweater_shadow'])

        # Hair Back (Gorgeous full flowing hair cascade)
        p(draw, ox, oy, 18, 13 + bob, 28, 34, C['hair'])
        p(draw, ox, oy, 20, 11 + bob, 24, 4, C['hair_hi'])
        p(draw, ox, oy, 16, 22 + bob, 32, 26, C['hair_shadow'])
        p(draw, ox, oy, 19, 44 + bob, 26, 8, C['hair_line'])

    else: # right
        # --- SIDE VIEW ---
        # Legs & Boots
        if frame_idx == 1:
            p(draw, ox, oy, 28, 70, 7, 12, C['skin'])
            p(draw, ox, oy, 28, 78, 7, 3, C['sock'])
            p(draw, ox, oy, 27, 81, 10, 7, C['boot'])
        elif frame_idx == 0:
            p(draw, ox, oy, 25, 69, 6, 12, C['skin_shadow'])
            p(draw, ox, oy, 25, 78, 6, 3, C['sock'])
            p(draw, ox, oy, 24, 81, 8, 7, C['boot'])
            p(draw, ox, oy, 32, 70, 7, 12, C['skin'])
            p(draw, ox, oy, 32, 78, 7, 3, C['sock'])
            p(draw, ox, oy, 32, 81, 10, 7, C['boot'])
        else:
            p(draw, ox, oy, 25, 70, 7, 12, C['skin'])
            p(draw, ox, oy, 25, 78, 7, 3, C['sock'])
            p(draw, ox, oy, 25, 81, 10, 7, C['boot'])
            p(draw, ox, oy, 33, 69, 6, 12, C['skin_shadow'])
            p(draw, ox, oy, 33, 78, 6, 3, C['sock'])
            p(draw, ox, oy, 33, 81, 8, 7, C['boot'])

        # Skirt side
        p(draw, ox, oy, 24, 60 + bob, 16, 11, C['skirt'])
        p(draw, ox, oy, 23, 68 + bob, 18, 4, C['skirt_hi'])

        # Sweater side
        p(draw, ox, oy, 24, 42 + bob, 16, 20, C['sweater'])
        p(draw, ox, oy, 26, 37 + bob, 10, 6, C['sweater_hi'])
        # Side Arm swing
        swing = 2 if frame_idx == 0 else -2 if frame_idx == 2 else 0
        p(draw, ox, oy, 28 + swing, 44 + bob, 6, 17, C['sweater_shadow'])
        p(draw, ox, oy, 29 + swing, 61 + bob, 4, 3, C['skin'])

        # Face profile
        p(draw, ox, oy, 26, 20 + bob, 16, 18, C['skin'])
        # Cute nose profile
        p(draw, ox, oy, 39, 29 + bob, 3, 2, C['skin'])
        # Eye profile
        p(draw, ox, oy, 34, 26 + bob, 4, 2, C['eye_lash'])
        p(draw, ox, oy, 35, 27 + bob, 3, 4, C['eye_top'])
        p(draw, ox, oy, 35, 27 + bob, 1, 2, C['eye_sparkle'])
        p(draw, ox, oy, 33, 31 + bob, 3, 2, C['blush'])

        # Hair profile
        p(draw, ox, oy, 20, 13 + bob, 22, 22, C['hair'])
        p(draw, ox, oy, 22, 11 + bob, 18, 4, C['hair_hi'])
        p(draw, ox, oy, 18, 22 + bob, 8, 26, C['hair_shadow'])
        # Front fringe
        p(draw, ox, oy, 35, 18 + bob, 5, 8, C['hair'])

def generate_spritesheet(name, draw_fn, output_path):
    img = Image.new('RGBA', (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    dirs = ['down', 'up', 'right']
    for r, dir_name in enumerate(dirs):
        for c in range(COLS):
            ox = c * FRAME_W
            oy = r * FRAME_H
            draw_fn(draw, c, dir_name, ox, oy)
    img.save(output_path, 'PNG')
    print(f"Generated {name} spritesheet at {output_path} ({FRAME_W * COLS}x{FRAME_H * ROWS})")

if __name__ == '__main__':
    generate_spritesheet('AN', draw_an, 'public/assets/an_spritesheet.png')
    generate_spritesheet('MIEN', draw_mien, 'public/assets/mien_spritesheet.png')
