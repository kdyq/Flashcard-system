# -*- coding: utf-8 -*-
"""验证 KaTeX 渲染 + 手机端截图核对"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5173'
SHOT = r'F:\MyProject\Flashcard system\test\shots'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    # 浏览器页搜索 LaTeX 卡
    page.goto(BASE + '/browse'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(600)
    page.fill('input[type="text"]', '求根公式')
    page.wait_for_timeout(800)
    katex = page.locator('.katex').count()
    print('PASS' if katex > 0 else 'FAIL', f'KaTeX 渲染 ({katex} 个公式元素)')
    page.screenshot(path=f'{SHOT}/08-katex.png', full_page=True)
    browser.close()
sys.exit(0)
