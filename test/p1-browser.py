# -*- coding: utf-8 -*-
"""P1 浏览器验证:填空卡渲染 + 浏览器批量 UI"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5173'
SHOT = r'F:\MyProject\Flashcard system\test\shots'
os.makedirs(SHOT, exist_ok=True)
errors = []
def log(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' | ' + extra if extra else ''))
    if not ok: errors.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # 1. 找到填空卡组 id
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    decks = page.evaluate("""fetch('/api/decks').then(r=>r.json())""")
    flat = []
    def walk(nodes):
        for n in nodes:
            flat.append(n)
            walk(n.get('children', []))
    walk(decks['items'])
    cloze_deck = next((d['id'] for d in flat if d['name'] == 'P1测试-填空'), None)
    log('P1填空卡组存在', cloze_deck is not None, str(cloze_deck))
    # 重置该卡组下的卡片,保证进队列
    if cloze_deck:
        cards = page.evaluate(f"""fetch('/api/cards?deckId={cloze_deck}&limit=50').then(r=>r.json())""")
        for c in cards['items']:
            page.evaluate(f"""fetch('/api/cards/{c['id']}/reset', {{method:'POST'}}).then(r=>r.json())""")

    # 2. 学习页:填空卡正面挖空
    page.goto(f'{BASE}/study/{cloze_deck}')
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(1000)
    blank = page.locator('.card-q .blank').count()
    log('正面挖空渲染', blank >= 1, f'{blank} 个空位')
    page.screenshot(path=f'{SHOT}/09-cloze-front.png')

    page.click('.card')
    page.wait_for_timeout(1100)
    key = page.locator('.card-a .key').count()
    log('背面高亮答案', key >= 1, f'{key} 个高亮')
    page.screenshot(path=f'{SHOT}/10-cloze-back.png')

    # 3. 浏览器页:批量 UI
    page.goto(f'{BASE}/browse')
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
    rows = page.locator('.table tbody tr').count()
    log('浏览器表格有数据', rows > 0, f'{rows} 行')
    # 勾选两行
    boxes = page.locator('.table tbody input[type=checkbox]')
    if boxes.count() >= 2:
        boxes.nth(0).check(); boxes.nth(1).check()
        page.wait_for_timeout(300)
        bar = page.locator('.panel .btn-ghost').count()
        log('批量操作栏出现', page.locator('text=已选').count() == 1)
        page.screenshot(path=f'{SHOT}/11-browse-batch.png')
    else:
        log('批量操作栏出现', False, '行数不足')

    # 4. 行点击 → 详情(复习历史)
    page.locator('.table tbody tr').first.click()
    page.wait_for_timeout(700)
    log('单卡详情弹出', page.locator('.modal').count() == 1)
    hist = page.locator('.modal').inner_text()
    log('详情含操作按钮', '重置进度' in hist and '搁置' in hist)
    page.screenshot(path=f'{SHOT}/12-browse-detail.png')

    browser.close()

print('控制台/page 错误:', len([e for e in errors if e.startswith('pageerror')]))
for e in errors[:8]: print(' ', e[:160])
sys.exit(1 if any(not e.startswith('pageerror') for e in errors) else 0)
