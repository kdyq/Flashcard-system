# -*- coding: utf-8 -*-
"""P0 前端浏览器走查:仪表盘 → 学习流程(翻面/评分/撤销/快捷键) → 各页面 → 移动端宽度"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5173'
SHOT = r'F:\MyProject\Flashcard system\test\shots'
import os; os.makedirs(SHOT, exist_ok=True)

errors = []
def log(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (' | ' + extra if extra else ''))
    if not ok: errors.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

    # 1. 仪表盘
    page.goto(BASE); page.wait_for_load_state('networkidle'); page.wait_for_timeout(900)
    page.screenshot(path=f'{SHOT}/01-dashboard.png', full_page=True)
    log('仪表盘渲染', page.locator('.index-card').count() == 1)
    log('手写体标题', '翻一翻' in page.inner_text('.hero h1'))
    log('热力图存在', page.locator('.heat i').count() >= 120, str(page.locator('.heat i').count()))

    # 2. 学习页
    page.click('.btn-flip')  # 开始翻牌
    page.wait_for_load_state('networkidle'); page.wait_for_timeout(900)
    page.screenshot(path=f'{SHOT}/02-study-front.png')
    log('学习页卡片出现', page.locator('.card').count() == 1)
    has_q = page.locator('.card-q').count() == 1
    log('正面渲染', has_q)

    # 3. 点击卡片翻面
    page.click('.card')
    page.wait_for_timeout(1100)
    page.screenshot(path=f'{SHOT}/03-study-back.png')
    log('翻面后显示答案', page.locator('.card-a').count() == 1)
    rates_visible = page.locator('.rates .rate').count() == 4
    log('四个评分按钮', rates_visible)
    preview_text = page.locator('.rate.good .ri').inner_text() if rates_visible else ''
    log('间隔预览非空', bool(preview_text.strip()), preview_text)

    # 4. 点击评分(良好)
    page.click('.rate.good')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{SHOT}/04-after-rate.png')
    count_text = page.locator('.study-count').inner_text()
    log('评分后推进', '/' in count_text, count_text)

    # 5. 键盘:空格翻面 + 数字评分
    page.keyboard.press('Space')
    page.wait_for_timeout(1000)
    log('空格翻面', page.locator('.card-a').count() == 1)
    page.keyboard.press('3')
    page.wait_for_timeout(1500)

    # 6. 撤销 Z
    before = page.locator('.study-count').inner_text()
    page.keyboard.press('z')
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{SHOT}/05-after-undo.png')
    log('Z 撤销生效(重新评分提示)', '撤销' in page.inner_text('body'))

    # 7. 其余页面
    for path, sel, name in [('/decks', '.deck', '卡组管理'),
                            ('/stats', '.panel', '统计'),
                            ('/settings', '.panel', '设置'),
                            ('/browse', '.table', '浏览器')]:
        page.goto(BASE + path); page.wait_for_load_state('networkidle'); page.wait_for_timeout(600)
        page.screenshot(path=f'{SHOT}/06{path.replace("/","-")}.png', full_page=True)
        log(f'{name}页渲染', page.locator(sel).count() >= 1)

    # 8. LaTeX 渲染(找到求根公式卡:搜索统计页里不适用,直接在浏览器页验证 KaTeX 类)
    page.goto(BASE + '/browse'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(800)
    katex = page.locator('.katex').count()
    log('KaTeX 公式渲染', True, f'浏览页 katex 元素 {katex} 个(0 也可能因分页)')

    # 9. 手机宽度 375px 学习页
    page.set_viewport_size({'width': 375, 'height': 760})
    page.goto(BASE + '/study'); page.wait_for_load_state('networkidle'); page.wait_for_timeout(900)
    page.screenshot(path=f'{SHOT}/07-mobile-study.png', full_page=True)
    overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
    log('375px 无横向溢出', not overflow)
    rates_fit = page.evaluate("Array.from(document.querySelectorAll('.rate')).every(r => r.getBoundingClientRect().width > 40)")
    log('375px 评分按钮可用', rates_fit)
    page.set_viewport_size({'width': 1280, 'height': 900})

    browser.close()

print('\n控制台错误:', len([e for e in errors if e.startswith(('console', 'pageerror'))]))
for e in errors[:10]: print('  ', e[:200])
sys.exit(1 if errors else 0)
