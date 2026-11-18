#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.4cm),
  numbering: "1",
)
#set text(
  font: ("New Computer Modern", "Microsoft YaHei", "SimSun"),
  size: 11pt,
  lang: "zh",
  region: "CN",
)
#set par(justify: true, leading: 0.95em)
#set heading(numbering: "1.1")
#set list(indent: 1.2em)
#set math.equation(numbering: "(1)")
#set table(stroke: 0.5pt + luma(180), inset: 6pt)

#align(center)[
  #text(size: 26pt, weight: "bold")[Typst 语法教程]
  #v(0.4em)
  #text(size: 12pt, fill: luma(90))[用一个可以编辑的项目，学会写论文]
]

#v(1em)

这份教程本身就是一个完整的 Typst 项目。你可以直接修改下面的文字和代码，右侧预览会自动更新。

- 左侧 *Files* 面板列出教程的每一章，点击即可切换文件。
- 顶部工具栏可以插入粗体、斜体、标题、列表、公式等常用语法。
- 左下角 *Outline* 显示文档结构，点击标题可以跳转。
- 想从头开始写自己的论文时，回到 Dashboard 新建项目即可。

#outline(title: [目录], depth: 2)

#pagebreak()
#include "01-basics.typ"
#include "02-formatting.typ"
#include "03-math.typ"
#include "04-figures-tables.typ"
#include "05-references.typ"

#pagebreak()
= 继续学习 <next-steps>

这篇教程只覆盖最常用的语法。更多内容可以查阅：

- #link("https://typst.app/docs/")[Typst 官方文档]
- #link("https://typst.app/docs/reference/")[函数与语法参考]
- #link("https://typst.app/universe/")[Typst Universe 模板社区]

> 本教程参考 Typst 官方文档编写，示例为教学目的改写；Typst 名称归 Typst GmbH 所有。
