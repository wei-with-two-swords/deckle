= 引用、链接与参考文献 <references>

== 交叉引用

Typst 用标签和引用把文档各部分连起来：

```typ
= 方法 <sec-method>

如 @sec-method 所示……
```

本教程里已经出现了 @fig-demo、@tbl-syntax 和 @eq-energy。增删内容后，编号会自动更新，不需要手工维护。

== 文献引用

Typst 内置参考文献支持。项目根目录的 `refs.yml` 使用 Hayagriva 格式：

```yaml
typst:
  type: web
  title: Typst Documentation
  author: Typst GmbH
  url: https://typst.app/docs/
  date: 2026-01-01
```

在正文中写 `@typst`，就会生成引用；文末用 `#bibliography` 输出文献表：

```typ
#bibliography("refs.yml", title: [参考文献])
```

@typst 提供了本文大部分语法示例的参考。正式论文中，把 `refs.yml` 换成自己的文献库即可。

== 脚注与链接

脚注用 `#footnote[...]`，链接用 `#link("网址")[显示文字]`。例如：

- 一段带脚注的说明#footnote[脚注内容会出现在页面底部。]。
- #link("https://typst.app/universe/")[Typst Universe] 可以找到论文、简历、幻灯片等模板。

== 一个完整的引用段落

> 排版系统的价值在于让作者专注于内容。@typst 的文档展示了标记语法、数学公式和自动编号如何协作。

== 下一步

到这里，你已经掌握了写一篇课程论文所需的大部分语法：

- 用 `#set` 统一页面、字体和段落；
- 用 `=`、`-`、`+` 组织结构；
- 用 `$...$` 写公式；
- 用 `figure` 管理图、表和编号；
- 用标签与 `@` 做交叉引用。

回到 Dashboard 新建一个空白项目，把学到的语法用起来吧。

#bibliography("refs.yml", title: [参考文献])
