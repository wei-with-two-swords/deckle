; Deckle 安装前「关闭运行中应用」的自定义检测。
; 由 nsis.include 注入，electron-builder 会用本文件里的 customCheckAppRunning
; 覆盖默认实现（见 allowOnlyOneInstallerInstance.nsh 的 !ifmacrodef 分支）。
;
; 为什么要覆盖：
;   默认实现在 PowerShell 可用时按「进程路径以 $INSTDIR 开头」检测，但在
;   PowerShell 被策略禁用时会回退到 tasklist /IM deckle.exe —— 全局按进程名
;   匹配，会命中任意目录下的同名副本（旧 Squirrel 版、绿色版、临时启动的实例）；
;   而未提权的安装器无权结束提权进程，重试失败后弹出「Deckle 无法关闭」，
;   用户点取消即导致安装中断。
;
; 本实现的规则：
;   1. 只处理可执行文件真正位于本次安装目录 $INSTDIR 内的 deckle.exe；
;      首次安装时该目录下没有程序，直接放行，绝不误伤其它副本。
;   2. 覆盖安装时关闭占用安装目录的实例，保证待覆盖文件不被占用。
;   3. PowerShell 不可用、命令异常时一律放行，不因检测本身失败阻断安装。
;   4. 只有确认「关闭后仍有占用进程」（退出码 1）才提示用户手动关闭，可重试或取消。

; 需与 builder.config.mjs 的 productName 保持一致。
!ifndef DECKLE_EXE_NAME
  !define DECKLE_EXE_NAME "deckle.exe"
!endif

; 返回 0 = 无占用进程或已成功关闭；1 = 关闭后仍有占用进程；其它 = 检测异常（视为放行）。
; $PowerShellPath 由 CHECK_APP_RUNNING 宏在调用本宏之前声明并赋值。
!macro DECKLE_CLOSE_OWN_APP _RETURN
  nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -C "try { $$dir = '$INSTDIR'; $$name = '${DECKLE_EXE_NAME}'; $$match = { $$_.Name -ieq $$name -and $$_.Path -and $$_.Path.StartsWith($$dir, 'CurrentCultureIgnoreCase') }; $$procs = @(Get-CimInstance -ClassName Win32_Process | ? $$match); foreach ($$i in 1..3) { if ($$procs.Count -eq 0) { break }; $$procs | % { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 700; $$procs = @(Get-CimInstance -ClassName Win32_Process | ? $$match) }; if ($$procs.Count -gt 0) { exit 1 } else { exit 0 } } catch { exit 0 }"`
  Pop ${_RETURN}
!macroend

!macro customCheckAppRunning
  ${if} ${FileExists} "$PowerShellPath"
    DeckleCloseOwnAppLoop:
    !insertmacro DECKLE_CLOSE_OWN_APP $R0
    ; 只有退出码 1 才提示；0 或任何异常都直接继续安装。
    ${if} $R0 == 1
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY DeckleCloseOwnAppLoop
      Quit
    ${endif}
  ${endif}
!macroend
