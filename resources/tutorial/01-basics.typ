= 基础语法 <basics>

== 三种模式

Typst 源文件大部分时间处在 *标记模式*（markup），也就是像写 Markdown 一样直接写正文。遇到 `#` 会进入 *代码模式*，用来调用函数；`[...]` 则是 *内容块*，可以在代码里嵌回排版内容。

- 标记模式：`普通文字`
- 代码模式：`#text(size: 14pt)[文字]`
- 内容块：`[可以包含 #emph[嵌套内容]]`

== 文本样式

*粗体*、_斜体_、`等宽字体`、#underline[下划线]、#strike[删除线]、#smallcaps[小型大写字母]。

这些样式可以嵌套，例如 *_又粗又斜_*，也可以只作用于一个词。

== 段落与换行

两个段落之间空一行即可。段落默认首行不缩进，中文论文常用 `#set par(first-line-indent: 2em)` 开启缩进。

需要强制换行时，在行尾写一个反斜杠：

```typ
第一行\
第二行
```

第一行\
第二行

== 列表

无序列表：

- 第一项
- 第二项
  - 嵌套项
  - 另一个嵌套项

有序列表：

+ 准备材料
+ 撰写初稿
+ 修改定稿

术语列表：

/ Typst: 一个现代化的排版系统。
/ Markup: 用少量符号描述文档结构的写法。

== 链接与标签

#link("https://typst.app/docs/")[Typst 官方文档] 会在 PDF 中生成可点击链接。

标题、图、表、公式都可以加标签，然后用 `@标签` 交叉引用。例如本章的标签是 `<basics>`，引用写作 `@basics`。

== 变量与函数

用 `#let` 定义变量和函数：

```typ
#let name = "Deckle"
#let square(x) = x * x
#let greet(who) = [你好，#who！]

#greet("Typst")
#square(12)
```

渲染结果：

#let name = "Deckle"
#let square(x) = x * x
#let greet(who) = [你好，#who！]

#greet("Typst")，12 的平方是 #square(12)。

== 注释

```typ
// 单行注释
/* 多行注释
   可以跨行 */
```

注释不会出现在预览或 PDF 中。

== show 规则初体验

`#show` 可以改写某类内容的外观。下面的规则会把本章后续出现的 “Typst” 自动加粗：

```typ
#show "Typst": strong
```

#[
  #show "Typst": strong
  Typst 的 show 规则很像 CSS：先选中，再决定如何显示。下一章会看到更多用法。
]
