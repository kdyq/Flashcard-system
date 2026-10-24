# 测试样例

导入功能(P0)开发与验收用的本地测试文件。所有文件均为 UTF-8 编码。

| 文件 | 用途 | 覆盖点 |
|------|------|--------|
| `sample-basic.csv` | 标准 CSV 导入(表头 `front,back,tags`) | 常规行、LaTeX、tags 多值(空格分隔) |
| `sample-edge.csv` | CSV 边界情况 | 字段内逗号、双引号转义(`""`)、字段内换行、空背面、空标签、CRLF |
| `sample-anki-export.txt` | Anki「Notes in plain text」导出文件(TAB 分隔,含 HTML) | `<br>` 转换行、剥 `<div>/<b>` 标签、HTML 实体(`&amp;` `&nbsp;`)、中文 |
| `sample-fanfan.json` | 本系统 JSON 格式导入 | 卡组树、卡片含 FSRS 状态、标签关联、复习日志 |

使用方式:开发时经设置页「导入」入口选择文件;或对 API 直接 `curl` 上传。
验收清单中「CSV 导入 Anki 导出文件成功」「JSON 导出→清库→导入还原一致」以此处文件为准。
