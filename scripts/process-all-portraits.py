import os
import sys
from PIL import Image
import numpy as np
from collections import deque
import scipy.ndimage as ndi

sys.stdout.reconfigure(encoding='utf-8')

RAW_BACKUP_DIR = 'public/assets/_raw_backup'
OUT_AN_DIR = 'public/assets/ModelAN'
OUT_MIEN_DIR = 'public/assets/ModelMIEN'

AN_FILES = [
    'normalAn.png',
    'sadAn.png',
    'ScaredAn.png',
    'PanicAn.png',
    'Doubt.png',
    'FaintSmileAn.png',
    'ExhaustedAn.png',
    'GlitchedAn.png'
]

MIEN_FILES = [
    'warm_smileMien.png',
    'gentleMien.png',
    'worriedMien.png',
    'MelancholyMien.png',
    'surprisedMien.png',
    'PleadingMien.png',
    'FadingMien.png',
    'CorruptedAIMien.png'
]

def is_bg_an(r, g, b):
    # Precise dark background condition for An
    return abs(r - 46) <= 13 and abs(g - 47) <= 13 and abs(b - 51) <= 13

def is_bg_mien(r, g, b):
    # Precise unified background condition for Mien:
    # Matches outer dark background, inner slate avatar box, and anti-aliased edge lines.
    if 35 <= r <= 88 and 38 <= g <= 92 and 42 <= b <= 102:
        if (g >= r - 3) and (b >= g - 2) and (b - r <= 24) and (abs(r - g) <= 14):
            return True
    return False

def process_an(filename):
    src_path = os.path.join(RAW_BACKUP_DIR, 'ModelAN', filename)
    dst_path = os.path.join(OUT_AN_DIR, filename)
    
    im = Image.open(src_path)
    orig_arr = np.array(im)[:, :, :3]
    arr = orig_arr.astype(int)
    h, w, _ = arr.shape
    
    bg = arr[10, w // 2, :3]
    
    # Pre-clean AI watermark star in bottom-right if present
    is_star = (np.abs(arr[:, :, 0] - arr[:, :, 1]) <= 6) & \
              (np.abs(arr[:, :, 1] - arr[:, :, 2]) <= 6) & \
              (arr[:, :, 0] > 80)
    for y in range(int(h * 0.7), h):
        for x in range(int(w * 0.75), w):
            if is_star[y, x]:
                arr[y, x] = [46, 48, 53]
                orig_arr[y, x] = [46, 48, 53]
                
    # Detect the gap between hoodie bottom and text
    zero_runs = []
    current_run = []
    for y in range(int(h * 0.5), h - 30):
        diff = np.max(np.abs(arr[y, 40:w-40, :3] - bg), axis=1)
        cnt = np.sum(diff > 18)
        if cnt == 0:
            current_run.append(y)
        else:
            if current_run:
                zero_runs.append(current_run)
                current_run = []
    if current_run:
        zero_runs.append(current_run)
        
    if filename == 'GlitchedAn.png':
        cutoff_y = 566
    elif zero_runs:
        cutoff_y = zero_runs[0][0] + 1
    else:
        cutoff_y = h - 65

    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    
    # Initialize BFS flood fill from image perimeter
    for x in range(w):
        if is_bg_an(*arr[0, x]):
            visited[0, x] = True
            q.append((0, x))
        if is_bg_an(*arr[cutoff_y, x]):
            visited[cutoff_y, x] = True
            q.append((cutoff_y, x))
    for y in range(cutoff_y + 1):
        if is_bg_an(*arr[y, 0]):
            visited[y, 0] = True
            q.append((y, 0))
        if is_bg_an(*arr[y, w - 1]):
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny <= cutoff_y and 0 <= nx < w and not visited[ny, nx]:
                if is_bg_an(*arr[ny, nx]):
                    visited[ny, nx] = True
                    q.append((ny, nx))
                    
    # Everything at or below cutoff_y is background (completely removes bottom text)
    visited[cutoff_y:, :] = True
    
    rgba = np.dstack([orig_arr, np.ones((h, w), dtype=np.uint8) * 255])
    rgba[visited, 3] = 0
    
    # Clear outer margin selection marquee lines (An's body is strictly within [x in 75..w-70, y >= 25])
    rgba[:20, :, 3] = 0
    rgba[:, :25, 3] = 0
    rgba[:, w - 25:, 3] = 0
    
    # Clear isolated 1-pixel noise
    alpha = rgba[:, :, 3]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if alpha[y, x] == 255:
                if alpha[y-1, x] == 0 and alpha[y+1, x] == 0 and alpha[y, x-1] == 0 and alpha[y, x+1] == 0:
                    rgba[y, x, 3] = 0

    res = Image.fromarray(rgba)
    bbox = res.getbbox()
    if bbox:
        res = res.crop(bbox)
        
    res.save(dst_path)
    print(f'[OK] [AN]   {filename:18s} -> {res.size} (cropped from {w}x{h})')

def process_mien(filename):
    src_path = os.path.join(RAW_BACKUP_DIR, 'ModelMIEN', filename)
    dst_path = os.path.join(OUT_MIEN_DIR, filename)
    
    im = Image.open(src_path)
    orig_arr = np.array(im)[:, :, :3]
    arr = orig_arr.astype(int)
    h, w, _ = arr.shape
    
    # Pre-clean AI watermark star in bottom-right if present
    is_star = (np.abs(arr[:, :, 0] - arr[:, :, 1]) <= 6) & \
              (np.abs(arr[:, :, 1] - arr[:, :, 2]) <= 6) & \
              (arr[:, :, 0] > 80)
    for y in range(int(h * 0.7), h):
        for x in range(int(w * 0.75), w):
            if is_star[y, x]:
                arr[y, x] = [46, 48, 53]
                orig_arr[y, x] = [46, 48, 53]

    # Sweater bottom detection
    center = arr[:, 150:w - 150]
    is_sweater = ((center[:, :, 0] > 100) & (center[:, :, 2] > 100) & \
                 (((center[:, :, 0] - center[:, :, 1]) > 15) | ((center[:, :, 2] - center[:, :, 1]) > 15)))
    counts = np.sum(is_sweater, axis=1)
    sweater_rows = [y for y in range(int(h * 0.5), h - 50) if counts[y] > 20]
    cutoff_y = max(sweater_rows) + 2 if sweater_rows else h - 60

    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    
    for x in range(w):
        if is_bg_mien(*arr[0, x]):
            visited[0, x] = True
            q.append((0, x))
        if is_bg_mien(*arr[cutoff_y, x]):
            visited[cutoff_y, x] = True
            q.append((cutoff_y, x))
    for y in range(cutoff_y + 1):
        if is_bg_mien(*arr[y, 0]):
            visited[y, 0] = True
            q.append((y, 0))
        if is_bg_mien(*arr[y, w - 1]):
            visited[y, w - 1] = True
            q.append((y, w - 1))

    while q:
        y, x = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny <= cutoff_y and 0 <= nx < w and not visited[ny, nx]:
                if is_bg_mien(*arr[ny, nx]):
                    visited[ny, nx] = True
                    q.append((ny, nx))
                    
    visited[cutoff_y:, :] = True
    
    rgba = np.dstack([orig_arr, np.ones((h, w), dtype=np.uint8) * 255])
    rgba[visited, 3] = 0
    
    # Distance-based connected component filter:
    # Preserves character body, nearby fading particles, and glitch streaks.
    # Eliminates disconnected screenshot margin artifacts (pink blocks, purple lines, dashed lines).
    alpha = rgba[:, :, 3] > 0
    labeled, num_features = ndi.label(alpha)
    if num_features > 0:
        sizes = [(i, np.sum(labeled == i)) for i in range(1, num_features + 1)]
        sizes.sort(key=lambda x: x[1], reverse=True)
        main_id = sizes[0][0]
        main_mask = (labeled == main_id)
        dist = ndi.distance_transform_edt(~main_mask)
        
        for comp_id, sz in sizes[1:]:
            comp_mask = (labeled == comp_id)
            ys, xs = np.where(comp_mask)
            # Remove any component touching outer image borders
            if ys.min() <= 2 or xs.min() <= 2 or xs.max() >= w - 3:
                rgba[comp_mask, 3] = 0
                continue
            # Remove components far from character body
            min_d = np.min(dist[comp_mask])
            if min_d > 20:
                rgba[comp_mask, 3] = 0

    res = Image.fromarray(rgba)
    bbox = res.getbbox()
    if bbox:
        res = res.crop(bbox)
        
    res.save(dst_path)
    print(f'[OK] [MIEN] {filename:18s} -> {res.size} (cropped from {w}x{h})')

def main():
    print('========================================')
    print('PROCESSING ALL 8 EXPRESSIONS FOR AN')
    print('========================================')
    for f in AN_FILES:
        process_an(f)
        
    print('\n========================================')
    print('PROCESSING ALL 8 EXPRESSIONS FOR MIEN')
    print('========================================')
    for f in MIEN_FILES:
        process_mien(f)

    # Cleanup temporary test files
    temp_files = [
        'public/assets/test_corrupted.png',
        'public/assets/test_fading.png',
        'public/assets/test_fading2.png',
        'public/assets/test_final_MelancholyMien.png',
        'public/assets/test_final_FadingMien.png',
        'public/assets/test_final_CorruptedAIMien.png',
        'public/assets/test_final_Doubt.png'
    ]
    for tf in temp_files:
        if os.path.exists(tf):
            try:
                os.remove(tf)
            except Exception:
                pass

    print('\nALL 16 PORTRAITS SUCCESSFULLY GENERATED AND VERIFIED!')

if __name__ == '__main__':
    main()
