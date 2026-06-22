Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int h2, bool r);
}
"@

Add-Type -AssemblyName System.Windows.Forms
$s  = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$w2 = [int]($s.Width  / 2)
$h2 = [int]($s.Height / 2)

$dir    = Split-Path $MyInvocation.MyCommand.Path
$cfg    = Get-Content "$dir\config.json" -Raw | ConvertFrom-Json
$total  = $cfg.nicks.Count
$n      = 4
$base   = [int]($total / $n)
$rem    = $total % $n

$slices = @()
$start  = 0
for ($i = 0; $i -lt $n; $i++) {
    $count   = $base + $(if ($i -lt $rem) { 1 } else { 0 })
    $slices += "$start $count"
    $start  += $count
}

$titles = @('bots-A', 'bots-B', 'bots-C', 'bots-D')
$pos    = @(
    @(0,   0,   $w2, $h2),
    @($w2, 0,   $w2, $h2),
    @(0,   $h2, $w2, $h2),
    @($w2, $h2, $w2, $h2)
)

# habilita ANSI/VT no cmd.exe (janelas novas ja pegam)
reg add "HKCU\Console" /v VirtualTerminalLevel /t REG_DWORD /d 1 /f 2>$null | Out-Null

for ($i = 0; $i -lt 4; $i++) {
    $cmd = "title $($titles[$i]) && cd /d `"$dir`" && node index.js --slice $($slices[$i])"
    $p   = Start-Process cmd.exe -ArgumentList "/k $cmd" -PassThru

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    do { Start-Sleep -Milliseconds 150; $p.Refresh() }
    while ($p.MainWindowHandle -eq [IntPtr]::Zero -and $sw.ElapsedMilliseconds -lt 6000)

    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
        $pp = $pos[$i]
        [WinApi]::MoveWindow($p.MainWindowHandle, $pp[0], $pp[1], $pp[2], $pp[3], $true) | Out-Null
    }

    Start-Sleep -Milliseconds 300
}
