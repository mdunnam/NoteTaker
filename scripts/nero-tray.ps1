# Nero system tray controller - status + control for Nero server and Slack listener
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$pm2 = "$env:APPDATA\npm\pm2.cmd"
$neroUrl = "http://localhost:6376"

function Test-NeroOnline {
    try {
        $req = [System.Net.WebRequest]::Create($neroUrl)
        $req.Timeout = 3000
        $res = $req.GetResponse()
        $res.Close()
        return $true
    } catch { return $false }
}

function Get-Pm2Status([string]$name) {
    try {
        $json = & $pm2 jlist 2>$null | Out-String | ConvertFrom-Json
        $proc = $json | Where-Object { $_.name -eq $name } | Select-Object -First 1
        if ($null -eq $proc) { return "not registered" }
        return $proc.pm2_env.status
    } catch { return "unknown" }
}

function New-NeroIcon([bool]$online) {
    $bmp = New-Object System.Drawing.Bitmap 16, 16
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    if ($online) { $color = [System.Drawing.Color]::FromArgb(124, 58, 237) }
    else { $color = [System.Drawing.Color]::FromArgb(90, 90, 100) }
    $brush = New-Object System.Drawing.SolidBrush $color
    $g.FillEllipse($brush, 0, 0, 15, 15)
    $font = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Bold)
    $g.DrawString("N", $font, [System.Drawing.Brushes]::White, 3.2, 1.2)
    $g.Dispose()
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

function Invoke-Pm2([string]$action, [string]$proc) {
    Start-Process -FilePath $pm2 -ArgumentList "$action $proc" -WindowStyle Hidden -Wait
    Start-Process -FilePath $pm2 -ArgumentList "save" -WindowStyle Hidden -Wait
}

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Visible = $true

function Update-Status {
    $online = Test-NeroOnline
    $notify.Icon = New-NeroIcon $online
    if ($online) {
        $notify.Text = "Nero - online"
        $script:statusItem.Text = "Server: online - localhost:6376"
    } else {
        $notify.Text = "Nero - offline"
        $script:statusItem.Text = "Server: offline"
    }
    $slack = Get-Pm2Status "nero-slack"
    $script:slackItem.Text = "Slack listener: $slack"
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$script:statusItem = $menu.Items.Add("Checking server...")
$statusItem.Enabled = $false
$script:slackItem = $menu.Items.Add("Checking Slack...")
$slackItem.Enabled = $false
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$openItem = $menu.Items.Add("Open Nero")
$openItem.Font = New-Object System.Drawing.Font($openItem.Font, [System.Drawing.FontStyle]::Bold)
$openItem.add_Click({ Start-Process $neroUrl })

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$startItem = $menu.Items.Add("Start server")
$startItem.add_Click({ Invoke-Pm2 "start" "nero"; Start-Sleep 3; Update-Status })

$restartItem = $menu.Items.Add("Restart server")
$restartItem.add_Click({
    Invoke-Pm2 "restart" "nero"
    $notify.ShowBalloonTip(2000, "Nero", "Server restarting...", [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep 5
    Update-Status
})

$stopItem = $menu.Items.Add("Stop server")
$stopItem.add_Click({ Invoke-Pm2 "stop" "nero"; Start-Sleep 1; Update-Status })

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$slackRestartItem = $menu.Items.Add("Restart Slack listener")
$slackRestartItem.add_Click({
    Invoke-Pm2 "restart" "nero-slack"
    $notify.ShowBalloonTip(2000, "Nero", "Slack listener restarting...", [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep 4
    Update-Status
})

$slackStopItem = $menu.Items.Add("Stop Slack listener")
$slackStopItem.add_Click({ Invoke-Pm2 "stop" "nero-slack"; Start-Sleep 1; Update-Status })

$slackStartItem = $menu.Items.Add("Start Slack listener")
$slackStartItem.add_Click({ Invoke-Pm2 "start" "nero-slack"; Start-Sleep 3; Update-Status })

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$logsItem = $menu.Items.Add("View server logs")
$logsItem.add_Click({
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$pm2' logs nero --lines 50"
})

$slackLogsItem = $menu.Items.Add("View Slack logs")
$slackLogsItem.add_Click({
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$pm2' logs nero-slack --lines 50"
})

$exitItem = $menu.Items.Add("Exit tray")
$exitItem.add_Click({
    $script:timer.Stop()
    $notify.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

$notify.ContextMenuStrip = $menu
$notify.add_MouseDoubleClick({ Start-Process $neroUrl })

Update-Status

$script:timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30000
$timer.add_Tick({ Update-Status })
$timer.Start()

[System.Windows.Forms.Application]::Run()