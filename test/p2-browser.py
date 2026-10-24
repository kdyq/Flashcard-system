# -*- coding: utf-8 -*-
"""P2 前端目检截图:设置页(调参/备份/提醒) + 统计页(本月打卡)"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:5173'
SHOT = r'F:\MyProject\Flashcard system\test\shots'
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 950})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/settings'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
    body = page.inner_text('body')
    for kw in ['FSRS 个性化调参', '自动备份', '复习提醒', '立即备份', '一键优化']:
        ok = kw in body
        print(('PASS ' if ok else 'FAIL ') + f'设置页含[{kw}]')
        if not ok: errors.append('missing ' + kw)
    page.screenshot(path=f'{SHOT}/13-settings-p2.png', full_page=True)
    page.goto(BASE + '/stats'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
    body2 = page.inner_text('body')
    ok = '本月打卡' in body2
    print(('PASS ' if ok else 'FAIL ') + '统计页含[本月打卡]')
    if not ok: errors.append('missing 本月打卡')
    page.screenshot(path=f'{SHOT}/14-stats-month.png', full_page=True)
    browser.close()
print('pageerror:', len(errors))
sys.exit(1 if errors else 0)
