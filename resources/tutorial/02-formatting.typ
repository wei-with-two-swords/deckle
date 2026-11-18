= 版式与样式 <formatting>

Typst 用 *set rules* 设置默认样式，用 *show rules* 改写内容外观。set 规则只影响它之后的内容；把 set 规则放在 `main.typ` 开头，就能统一整篇文档。

== 页面设置

```typ
#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.4cm),
  numbering: "1",
)
```

- `paper` 可以是 `"a4"`、`"a5"`、`"us-letter"` 等。
- `margin` 可以是一个长度，也可以分别设置 `x`、`y` 或四边。
- `numbering` 开启页码；`numbering: none` 则关闭。

== 文字样式

#text(size: 16pt, fill: blue)[蓝色的大字] 和 #text(weight: "bold", tracking: 0.08em)[加宽字距的粗体]。

还可以使用 #highlight(fill: yellow)[荧光笔高亮]、#text(fill: rgb("#007aff"))[品牌蓝] 等效果。

== 段落对齐

#align(center)[这一行居中]
#align(right)[这一行右对齐]

正文默认两端对齐。可以通过 `#set par(justify: false)` 改成左对齐，或用 `#set par(first-line-indent: 2em)` 开启首行缩进。

== 块、引用与脚注

#block(
  fill: luma(245),
  stroke: 0.5pt + luma(210),
  inset: 12pt,
  radius: 4pt,
  width: 100%,
)[
  *提示：* 这是一个带背景色和描边的块，常用来放重点说明。
]

#quote(attribution: [Typst 文档])[
  好的排版让读者专注于内容，而不是格式。
]

这是一句带脚注的话#footnote[脚注会自动编号，并排在页面底部。]。

== 间距与分页

- `#v(1em)` 增加垂直间距。
- `#h(1em)` 增加水平间距。
- `#pagebreak()` 强制分页。

下面的代码会空出 1em 的高度，然后继续正文：

#v(1em)

这一段之前多了一点空白。

== 标题层级

Typst 用等号表示标题层级：

```typ
= 一级标题
== 二级标题
=== 三级标题
```

`#set heading(numbering: "1.1")` 会自动编号；想自定义某一级标题的样式，可以写 show 规则：

```typ
#show heading.where(level: 2): set text(size: 13pt)
```

== 多栏排版

`#columns(2)[...]` 可以把内容分成两栏。下面的例子把两段文字并排：

#columns(2, gutter: 1.2em)[
  *左栏*\
  Typst 会根据栏宽自动换行，适合放并列的说明。

  *右栏*\
  分栏内容仍然遵循当前的字体、段落和编号设置。
]

分栏结束后，后续内容会自动回到单栏。
