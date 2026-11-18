= 数学公式 <math>

在 `$...$` 中写数学。放在段落里的叫行内公式，例如 $a^2 + b^2 = c^2$；单独成段的叫行间公式，例如：

$ sum_(i=1)^n i = (n(n+1))/2 $

== 常用结构

- 上下标：$x^2$、$a_(i,j)$、$e^(-x)$
- 分数：$(a+b)/2$、$frac(1, sqrt(2))$
- 根号：$sqrt(x^2 + y^2)$、$root(3, x)$
- 积分：$integral_0^1 x^2 upright(d) x = 1/3$
- 求和与连乘：$sum_(k=1)^n k$、$product_(k=1)^n k$
- 极限：$lim_(x -> 0) sin(x)/x = 1$

== 希腊字母与符号

$alpha, beta, gamma, delta, theta, lambda, mu, pi, sigma, phi$

$Delta, Omega, infinity, partial, nabla, in, subset, union, inter$

== 矩阵与分段函数

$ mat(1, 2; 3, 4) quad mat(delim: "[", 1, 0; 0, 1) $

$ f(x) = cases(
  0 & "当" x < 0,
  1 & "当" x >= 0,
) $

== 对齐的推导

$
  (a+b)^2 &= a^2 + 2 a b + b^2 \
          &= a^2 + b^2 + 2 a b
$

`&` 用于对齐，`\` 用于换行。多行公式也可以放进 `cases` 或 `mat` 中。

== 编号与引用

行间公式默认会编号。给公式加标签：

```typ
$ E = m c^2 $ <eq-energy>
```

$ E = m c^2 $ <eq-energy>

现在可以用 `@eq-energy` 引用它：由 @eq-energy 可知，质量和能量可以相互转化。

== 数学中的文字

在公式里写普通文字要用引号：$f(x) = 0 quad "当且仅当" x = 0$。中文会使用当前文本字体，英文则保持数学字体。
