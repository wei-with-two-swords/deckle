= 图、表与交叉引用 <figures>

论文里的图、表、公式都应该能自动编号，并且可以被正文引用。Typst 的 `figure` 把内容和题注组合在一起，正好解决这个问题。

== 一个简单的图

```typ
#figure(
  rect(width: 80%, height: 3.2cm, fill: luma(238)),
  caption: [用矩形画的占位图。],
) <fig-demo>
```

#figure(
  rect(
    width: 80%,
    height: 3.2cm,
    fill: luma(238),
    stroke: 0.5pt + luma(170),
  )[
    #align(center + horizon)[示例图：一个灰色矩形]
  ],
  caption: [用 `rect` 画的占位图。真实论文中通常放 `image("figure.png")`。],
) <fig-demo>

正文里写 `@fig-demo`，就会得到“图 @fig-demo”这样的引用。编号会随着图的增删自动变化。

== 一个三线表

#figure(
  table(
    columns: (1fr, 2fr, 2fr),
    stroke: none,
    table.hline(stroke: 1pt),
    [*语法*], [*作用*], [*示例*],
    table.hline(stroke: 0.5pt),
    [`*粗体*`], [加粗], [*文字*],
    [`_斜体_`], [斜体], [_文字_],
    [`$x^2$`], [上标], [$x^2$],
    table.hline(stroke: 1pt),
  ),
  caption: [常用行内语法速查表。],
) <tbl-syntax>

表 @tbl-syntax 汇总了几个最常用的行内标记。`table.hline` 用来画三线表的横线，`stroke: none` 关掉默认网格。

== 并排两张图

#grid(
  columns: (1fr, 1fr),
  gutter: 1em,
  [
    #figure(
      rect(width: 100%, height: 2.2cm, fill: rgb("#e8f1ff")),
      caption: [左图],
    ) <fig-left>
  ],
  [
    #figure(
      rect(width: 100%, height: 2.2cm, fill: rgb("#e9f7ec")),
      caption: [右图],
    ) <fig-right>
  ],
)

`grid` 适合做并排布局；@fig-left 和 @fig-right 会分别编号。

== 图片文件

如果项目里有图片，可以这样插入：

```typ
#figure(
  image("images/result.png", width: 80%),
  caption: [实验结果。],
) <fig-result>
```

把图片放在项目文件夹中，用相对路径引用。支持 PNG、JPEG、SVG 等常见格式。

== 图表编号格式

默认编号是 `1`、`2`…… 想改成“图 1”“表 1”，可以在 `main.typ` 里设置：

```typ
#set figure(numbering: "图 1")
```

本教程使用默认编号，避免和章节编号混在一起。
