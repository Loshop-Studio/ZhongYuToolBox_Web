# Tests a first installation in an isolated workspace directory. Never replaces an existing installation.
param([switch]$SkipDesktopShortcut)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskBuild = Get-Content -LiteralPath (Join-Path $taskRoot '.local/latest-installer-build.json') -Raw | ConvertFrom-Json
$taskUninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{79877EC8-D1D0-4FD6-BBA4-2F354332AF13}_is1'
if (Test-Path $taskUninstallKey) { throw 'An installation already exists. Do not run this first-install test against it.' }
if ((Get-FileHash -LiteralPath $taskBuild.installer -Algorithm SHA256).Hash -ne $taskBuild.sha256) { throw 'Installer checksum mismatch' }
$taskId = [Guid]::NewGuid().ToString('N')
$taskVerification = Join-Path $taskRoot ('.local/installer-verification-' + $taskId)
$taskInstallDir = Join-Path $taskVerification '安装验证 app'
$taskGroup = '中育Toolbox 安装验证 ' + $taskId
$taskDesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) '中育Toolbox.lnk'
if ((Test-Path -LiteralPath $taskDesktopLink) -and !$SkipDesktopShortcut) { throw 'Desktop shortcut already exists; use -SkipDesktopShortcut to preserve it during verification' }
$taskDesktopHash = if (Test-Path -LiteralPath $taskDesktopLink) { (Get-FileHash -LiteralPath $taskDesktopLink -Algorithm SHA256).Hash } else { $null }
$taskCacheDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ZhongYuToolbox-aoki-WebView2'
$taskCanary = Join-Path $taskCacheDir ('installer-preservation-' + $taskId + '.txt')
New-Item -ItemType Directory -Path $taskVerification -Force | Out-Null
New-Item -ItemType Directory -Path $taskCacheDir -Force | Out-Null
Set-Content -LiteralPath $taskCanary -Value $taskId
$taskChecks = [System.Collections.Generic.List[string]]::new()
function Invoke-TaskSetup([string]$LogName) {
    $taskArguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/NOCLOSEAPPLICATIONS','/NORESTARTAPPLICATIONS',
        ('/DIR="' + $taskInstallDir + '"'), ('/GROUP="' + $taskGroup + '"'), $(if ($SkipDesktopShortcut) { '/TASKS=' } else { '/TASKS=desktopicon' }),
        ('/LOG="' + (Join-Path $taskVerification $LogName) + '"'))
    $taskProcess = Start-Process -FilePath $taskBuild.installer -ArgumentList $taskArguments -WindowStyle Hidden -Wait -PassThru
    if ($taskProcess.ExitCode -ne 0) { throw ('Installer failed: ' + $taskProcess.ExitCode) }
}
function Assert-TaskPayload {
    foreach ($taskFile in $taskBuild.files) {
        $taskPath = Join-Path $taskInstallDir $taskFile.path
        if (!(Test-Path -LiteralPath $taskPath) -or (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash -ne $taskFile.sha256) {
            throw ('Installed file differs: ' + $taskFile.path)
        }
    }
}
try {
    Invoke-TaskSetup 'install.log'
    Assert-TaskPayload
    $taskChecks.Add('Fresh installation and all payload SHA-256 hashes')
    $taskRegistration = Get-ItemProperty $taskUninstallKey
    if ($taskRegistration.DisplayVersion -ne $taskBuild.version -or $taskRegistration.InstallLocation.TrimEnd('\') -ne $taskInstallDir) { throw 'Uninstall registration mismatch' }
    $taskChecks.Add('Current-user uninstall registration and version')
    $taskShell = New-Object -ComObject WScript.Shell
    $taskExe = Join-Path $taskInstallDir '中育Toolbox.exe'
    if (!$SkipDesktopShortcut) {
        $taskLink = $taskShell.CreateShortcut($taskDesktopLink)
        if ($taskLink.TargetPath -ne $taskExe -or $taskLink.WorkingDirectory -ne $taskInstallDir) { throw 'Desktop shortcut mismatch' }
    }
    $taskMenuLink = Join-Path ([Environment]::GetFolderPath('StartMenu')) ('Programs\' + $taskGroup + '\中育Toolbox.lnk')
    if (!(Test-Path -LiteralPath $taskMenuLink) -or $taskShell.CreateShortcut($taskMenuLink).TargetPath -ne $taskExe) { throw 'Start menu shortcut mismatch' }
    $taskChecks.Add($(if ($SkipDesktopShortcut) { 'Start menu shortcut target; desktop shortcut preserved' } else { 'Desktop and Start menu shortcut targets' }))
    $taskProcess = Start-Process -FilePath $taskExe -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
    if ($taskProcess.ExitCode -ne 0 -or !(Get-Content -LiteralPath (Join-Path $taskInstallDir 'self-test.json') -Raw | ConvertFrom-Json).passed) { throw 'Installed native executable self-test failed' }
    $taskChecks.Add('Installed native executable self-test')
    $taskFramework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
    $taskProbe = Join-Path $taskInstallDir 'installer-smoke-test.exe'
    $taskReferences = @('System.dll','System.Core.dll','System.Xaml.dll','WPF/WindowsBase.dll','WPF/PresentationCore.dll','WPF/PresentationFramework.dll') | ForEach-Object { '/reference:' + (Join-Path $taskFramework $_) }
    $taskReferences += '/reference:' + (Join-Path $taskInstallDir 'Microsoft.Web.WebView2.Core.dll')
    $taskReferences += '/reference:' + (Join-Path $taskInstallDir 'Microsoft.Web.WebView2.Wpf.dll')
    & (Join-Path $taskFramework 'csc.exe') /nologo /target:winexe /platform:x64 /codepage:65001 ('/out:' + $taskProbe) $taskReferences (Join-Path $taskRoot 'native-windows/InstallerSmoke.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Launch probe compilation failed' }
    Copy-Item -LiteralPath ($taskExe + '.config') -Destination ($taskProbe + '.config')
    $taskLaunchReport = Join-Path $taskVerification 'launch.json'
    $taskProfile = Join-Path $taskVerification 'isolated-webview2-profile'
    $taskProcess = Start-Process -FilePath $taskProbe -ArgumentList @(('"' + $taskProfile + '"'), ('"' + $taskLaunchReport + '"')) -WindowStyle Hidden -Wait -PassThru
    if ($taskProcess.ExitCode -ne 0 -or !(Get-Content -LiteralPath $taskLaunchReport -Raw | ConvertFrom-Json).passed) { throw 'Installed production UI launch failed' }
    Remove-Item -LiteralPath $taskProbe, ($taskProbe + '.config')
    $taskChecks.Add('Installed production WPF/WebView2 window renders Vue login UI in an isolated profile')
    $taskUserFile = Join-Path $taskInstallDir 'user-created-test.txt'
    Set-Content -LiteralPath $taskUserFile -Value $taskId
    Add-Content -LiteralPath (Join-Path $taskInstallDir 'bridge.js') -Value '// upgrade replacement check'
    Invoke-TaskSetup 'upgrade.log'
    Assert-TaskPayload
    if ((Get-Content -LiteralPath $taskUserFile -Raw).Trim() -ne $taskId -or (Get-Content -LiteralPath $taskCanary -Raw).Trim() -ne $taskId) { throw 'Upgrade removed retained data' }
    $taskChecks.Add('Cover installation repairs payload and retains user files/cache')
    if ((Get-Content -LiteralPath (Join-Path $taskVerification 'install.log') -Raw) -notmatch 'Runtime detected; installation skipped') { throw 'Installed WebView2 was not detected' }
    $taskChecks.Add('Installed WebView2 Runtime detected without downloading')
} finally {
    $taskUninstaller = Join-Path $taskInstallDir 'unins000.exe'
    if (Test-Path -LiteralPath $taskUninstaller) {
        $taskProcess = Start-Process -FilePath $taskUninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="' + (Join-Path $taskVerification 'uninstall.log') + '"')) -WindowStyle Hidden -Wait -PassThru
        if ($taskProcess.ExitCode -ne 0) { throw 'Verification uninstaller failed' }
    }
    # Remove only the unique canary created by this test, never the user's cache directory.
    if (!(Test-Path -LiteralPath $taskCanary) -or (Get-Content -LiteralPath $taskCanary -Raw).Trim() -ne $taskId) { throw 'Uninstall removed or modified the account-cache canary' }
    Remove-Item -LiteralPath $taskCanary
}
if (Test-Path $taskUninstallKey) { throw 'Uninstall registration left behind' }
if ((!$SkipDesktopShortcut -and (Test-Path -LiteralPath $taskDesktopLink)) -or (Test-Path -LiteralPath $taskMenuLink)) { throw 'Uninstall shortcut cleanup failed' }
if ($SkipDesktopShortcut -and $taskDesktopHash -and (!(Test-Path -LiteralPath $taskDesktopLink) -or (Get-FileHash -LiteralPath $taskDesktopLink -Algorithm SHA256).Hash -ne $taskDesktopHash)) { throw 'Existing desktop shortcut was modified' }
foreach ($taskFile in $taskBuild.files) { if (Test-Path -LiteralPath (Join-Path $taskInstallDir $taskFile.path)) { throw ('Uninstall retained registered file: ' + $taskFile.path) } }
if ((Get-Content -LiteralPath $taskUserFile -Raw).Trim() -ne $taskId) { throw 'Uninstall deleted user-created data' }
$taskChecks.Add('Uninstall removes payload, shortcuts and registry, retains user files/account cache')
$taskResult = [pscustomobject]@{ passed=$true; installer=$taskBuild.installer; sha256=$taskBuild.sha256; files=$taskBuild.files.Count; verification=$taskVerification; checks=$taskChecks }
$taskResult | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRoot '.local/installer-verified.json') -Encoding utf8
$taskResult | ConvertTo-Json -Depth 4
