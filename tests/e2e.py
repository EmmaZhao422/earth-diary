"""End-to-end smoke test for Earth Diary (Playwright + headless Chromium).

Run from the repo root:
    python3 -m http.server 8765 &
    python3 tests/e2e.py [media_dir] [screenshot_dir]

`media_dir` must contain photo1.jpg, photo2.png and clip.webm.
The test uses ?style=blank so it does not depend on the map tile host.
"""
import sys, zipfile, os
from playwright.sync_api import sync_playwright, expect

MEDIA = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
BASE = os.environ.get('ED_BASE', 'http://localhost:8765/index.html')
os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
errors = []


def shot(pg, name):
    pg.screenshot(path=f'{SHOTS}/{name}.png')


def count(pg):
    return int(pg.inner_text('#count-badge'))


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 1360, 'height': 820}, accept_downloads=True, locale='en-US')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'console.error: {m.text[:200]}') if m.type == 'error' and 'Failed to load resource' not in m.text and 'photon' not in m.text else None)

    pg.goto(BASE + '?style=blank')
    pg.wait_for_selector('.modal-welcome')
    pg.click('[data-a="start"]')
    pg.wait_for_timeout(600)
    assert count(pg) == 0

    # --- create a memory ---
    pg.click('#fab-add')
    expect(pg.locator('#placing-bar')).to_be_visible()
    pg.mouse.click(820, 400)
    pg.wait_for_selector('#editor')
    pg.click('.char-opt[data-char="bunny"]')
    pg.click('.color-dot[data-color="#F7C8FF"]')
    pg.fill('#ed-title', 'First pin from the test')
    pg.fill('#ed-date', '2025-06-01')
    pg.click('.mood-opt[data-mood="🤩"]')
    pg.fill('#ed-place', 'Test Café')
    pg.fill('#ed-text', 'Line one of the diary.\nLine two <b>not html</b>.')
    pg.fill('#ed-tags', 'food, friends')
    pg.set_input_files('#ed-files', [f'{MEDIA}/photo1.jpg', f'{MEDIA}/photo2.png', f'{MEDIA}/clip.webm'])
    pg.wait_for_function("document.querySelectorAll('#ed-media .media-tile:not(.is-loading)').length === 3", timeout=20000)
    shot(pg, '01-editor')
    pg.click('#ed-save')
    pg.wait_for_selector('.detail')
    assert count(pg) == 1
    assert pg.inner_text('.detail-title') == 'First pin from the test'
    assert '<b>not html</b>' in pg.inner_text('.detail-text')
    assert pg.locator('.gal-item').count() == 3
    pg.wait_for_timeout(1200)
    shot(pg, '02-detail')

    # --- lightbox ---
    pg.click('.gal-item[data-i="0"]')
    pg.wait_for_selector('#lb-stage img')
    pg.keyboard.press('ArrowRight'); pg.wait_for_selector('#lb-stage img')
    pg.keyboard.press('ArrowRight'); pg.wait_for_selector('#lb-stage video')
    shot(pg, '03-lightbox')
    pg.keyboard.press('Escape')
    expect(pg.locator('#lightbox')).to_be_hidden()

    # --- edit: rename + remove one photo ---
    pg.click('[data-act="edit"]')
    pg.wait_for_selector('#editor')
    pg.fill('#ed-title', 'Renamed pin')
    pg.locator('#ed-media .media-x').first.click()
    pg.click('#ed-save')
    pg.wait_for_selector('.detail')
    assert pg.inner_text('.detail-title') == 'Renamed pin'
    assert pg.locator('.gal-item').count() == 2

    # --- persistence across reload ---
    pg.reload()
    pg.wait_for_timeout(1500)
    assert count(pg) == 1, 'memory should survive a reload'
    assert pg.locator('.mem-card b').first.inner_text() == 'Renamed pin'

    # --- samples, passport, share card ---
    pg.click('#btn-settings'); pg.click('[data-act="samples"]')
    pg.wait_for_function("document.querySelector('#count-badge').textContent === '8'", timeout=20000)
    pg.wait_for_timeout(2500)
    shot(pg, '04-samples-globe')
    pg.click('.tab[data-tab="passport"]')
    assert pg.locator('.stat').count() == 6
    assert pg.locator('.country-row[data-cc]').count() == 7
    pg.locator('input[data-setting="journey"] + i').click()
    pg.wait_for_timeout(800)
    shot(pg, '05-passport-journey')
    pg.click('[data-act="card"]')
    pg.wait_for_selector('.card-preview')
    pg.wait_for_timeout(500)
    shot(pg, '06-share-card')
    pg.keyboard.press('Escape')

    # --- pin click opens detail ---
    pg.click('.tab[data-tab="timeline"]')
    pg.locator('.mem-card').nth(1).click()
    pg.wait_for_selector('.detail')
    pg.wait_for_timeout(2600)
    shot(pg, '07-detail-sample')
    assert pg.locator('.pin.is-selected').count() == 1
    assert pg.locator('.plan-links a').count() == 3, 'affiliate links should render for a place with a city'
    pg.keyboard.press('Escape')

    # --- export, wipe, import ---
    pg.click('#btn-settings')
    with pg.expect_download() as dl:
        pg.click('[data-act="export"]')
    path = f'{SHOTS}/backup.zip'
    dl.value.save_as(path)
    names = zipfile.ZipFile(path).namelist()
    assert 'earth-diary.json' in names and sum(n.startswith('media/') for n in names) == 9, names
    pg.click('[data-act="wipe"]'); pg.click('.modal-confirm [data-a="yes"]')
    pg.wait_for_timeout(600)
    assert count(pg) == 0
    pg.click('#btn-settings')
    pg.set_input_files('#import-file', path)
    pg.wait_for_function("document.querySelector('#count-badge').textContent === '8'", timeout=20000)
    pg.wait_for_timeout(1500)
    assert pg.locator('.mem-thumb[data-thumb]').count() == 8

    # --- search by coordinates + spot popup + quick pin ---
    pg.fill('#search-input', '35.6595, 139.7005')
    pg.wait_for_selector('.search-item')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.spot [data-act="pin"]', timeout=8000)
    pg.click('.spot [data-act="pin"]')
    pg.wait_for_selector('#editor')
    pg.click('[data-act="cancel"]')
    pg.wait_for_timeout(300)
    assert pg.locator('#editor').count() == 0

    # --- delete ---
    pg.locator('.mem-card').first.click()
    pg.wait_for_selector('.detail')
    pg.click('[data-act="delete"]'); pg.click('.modal-confirm [data-a="yes"]')
    pg.wait_for_timeout(500)
    assert count(pg) == 7

    # --- language ---
    pg.click('#btn-lang')
    pg.wait_for_timeout(400)
    assert pg.inner_text('.tab[data-tab="passport"]') == '护照'
    shot(pg, '08-chinese')
    pg.click('#btn-lang')

    # --- ad slot preview ---
    pg.goto(BASE + '?style=blank&ads=preview')
    pg.wait_for_timeout(1500)
    assert pg.locator('.ad-preview').count() >= 1
    shot(pg, '09-ads-preview')

    # --- mobile ---
    m = ctx.new_page()
    m.set_viewport_size({'width': 390, 'height': 800})
    m.on('pageerror', lambda e: errors.append(f'mobile pageerror: {e}'))
    m.goto(BASE + '?style=blank')
    m.wait_for_timeout(2500)
    shot(m, '10-mobile-map')
    m.click('.tab[data-tab="timeline"]')
    m.wait_for_timeout(600)
    shot(m, '11-mobile-sheet')
    m.locator('.mem-card').first.click()
    m.wait_for_selector('.detail')
    m.wait_for_timeout(800)
    shot(m, '12-mobile-detail')

    b.close()

if errors:
    print('ERRORS:'); [print(' ', e) for e in errors]
    sys.exit(1)
print('ALL OK')
