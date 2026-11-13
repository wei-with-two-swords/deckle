export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

const PAPER = `#set page(paper: "a4", margin: 2.5cm)
#set text(font: ("New Computer Modern", "Microsoft YaHei"), size: 11pt, lang: "zh")
#set par(justify: true, leading: 1em)
#set heading(numbering: "1.")
#set figure(supplement: [图], numbering: "1")
#show figure.where(kind: table): set figure(supplement: [表])

#align(center)[
  #text(size: 20pt, weight: "bold")[无标题文档]
  #v(0.4em)
  作者姓名 \\
  #datetime.today().display("[year] 年 [month] 月 [day] 日")
]

= 引言

这是 Typstor 创建的示例文档。你可以直接编辑这段文字。

= 公式示例

$ E = m c^2 $

= 列表

- 第一项
- 第二项

= 图表示例

#figure(
  rect(width: 55%, height: 36pt, fill: rgb("#eff0f3"), stroke: rgb("#bdbfcc")),
  caption: [示例插图：用矩形代替图片],
)

#figure(
  table(
    columns: 3,
    inset: 4pt,
    [指标], [数值], [单位],
    [编译], [27], [ms],
    [渲染], [9], [ms],
  ),
  caption: [示例表格：编译与渲染耗时],
  kind: table,
)
`;

const BLANK = `#set page(paper: "a4", margin: 2.5cm)
#set text(font: ("New Computer Modern", "Microsoft YaHei"), size: 11pt, lang: "zh")
#set par(justify: true, leading: 1em)

= 标题

从这里开始写作。
`;

const COURSE = `#set page(paper: "a4", margin: 2.5cm)
#set text(font: ("New Computer Modern", "Microsoft YaHei"), size: 11pt, lang: "zh")
#set par(justify: true, leading: 1em)
#set heading(numbering: "1.")

#align(center)[
  #text(size: 20pt, weight: "bold")[课程论文题目]
  #v(0.4em)
  姓名：\\
  学号：\\
  课程：\\
  #datetime.today().display("[year] 年 [month] 月 [day] 日")
]

= 摘要

在这里写摘要。

= 引言

在这里写研究背景与问题。

= 方法

在这里写方法或分析框架。

= 结论

在这里写结论。
`;

const LAB = `#set page(paper: "a4", margin: 2.5cm)
#set text(font: ("New Computer Modern", "Microsoft YaHei"), size: 11pt, lang: "zh")
#set par(justify: true, leading: 1em)
#set heading(numbering: "1.")

#align(center)[
  #text(size: 20pt, weight: "bold")[实验报告]
  #v(0.4em)
  姓名：\\
  学号：\\
  实验名称：\\
  #datetime.today().display("[year] 年 [month] 月 [day] 日")
]

= 实验目的

在这里写实验目的。

= 实验原理

在这里写实验原理。

= 实验步骤

+ 第一步
+ 第二步

= 实验结果

在这里写结果，可以插入表格或图片。

= 讨论

在这里写误差分析与讨论。
`;

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'paper',
    name: '论文模板',
    description: '标题、公式、列表与图表示例',
    content: PAPER,
  },
  {
    id: 'course',
    name: '课程论文',
    description: '课程、姓名、摘要与章节结构',
    content: COURSE,
  },
  {
    id: 'lab',
    name: '实验报告',
    description: '目的、原理、步骤、结果与讨论',
    content: LAB,
  },
  {
    id: 'blank',
    name: '空白项目',
    description: '只保留页面与文字设置',
    content: BLANK,
  },
];
