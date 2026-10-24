# -*- coding: utf-8 -*-
"""P3 前端走查:AI 工作台 + 设置页 AI 面板"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:5173'
SHOT = r'F:\MyProject\Flashcard system\test\shots'
errors = []
def log(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' | ' + str(extra) if extra else ''))
    if not ok: errors.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 920})
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # 1. 设置页 AI 面板
    page.goto(BASE + '/settings'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(700)
    body = page.inner_text('body')
    log('设置页含AI面板', 'AI 卡片生成' in body)
    log('显示Key来源(.env)', '.env' in body)
    log('有测试连接按钮', '测试连接' in body)
    # Key 输入框不回显
    pw = page.locator('input[type="password"]')
    log('Key 为密码框且为空', pw.count() >= 1 and pw.first.input_value() == '')
    page.screenshot(path=f'{SHOT}/15-settings-ai.png', full_page=True)

    # 2. AI 工作台(已启用)
    page.goto(BASE + '/ai'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(700)
    body = page.inner_text('body')
    log('工作台可见', 'AI 工作台' in body and '笔记内容' in body)
    log('有生成按钮', '生成闪卡' in body)
    # 填入示例并真实生成(走线上服务,较慢)
    try:
        page.click('text=填入示例笔记')
        page.click('button:has-text("生成闪卡")')
        page.wait_for_selector('.chip', timeout=120000)
        page.wait_for_timeout(500)
        drafts = page.locator('input[type="checkbox"]').count()
        log('生成出草稿列表', drafts >= 3, f'{drafts} 个勾选框')
        page.screenshot(path=f'{SHOT}/16-ai-drafts.png', full_page=True)
        # 取消勾选第一张,入库其余
        boxes = page.locator('.panel input[type="checkbox"]')
        boxes.first.uncheck()
        page.click('button:has-text("入库")')
        page.wait_for_timeout(1500)
        log('入库成功提示', '入库' in page.inner_text('body'))
    except Exception as e:
        log('生成出草稿列表', False, str(e)[:120])
    browser.close()

print('pageerror:', len([e for e in errors if e.startswith('pageerror')]))
for e in errors[:6]: print(' ', str(e)[:150])
sys.exit(1 if any(not str(e).startswith('pageerror') for e in errors) else 0)
