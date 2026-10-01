; Inno Setup 6.7.3. Paths and the exact payload manifest are supplied by build-installer.mjs.
#ifndef AppVersion
  #error AppVersion is required
#endif
#define AppName "中育工具箱 · aoki"
#define AppExe "中育工具箱-aoki.exe"

[Setup]
AppId={{79877EC8-D1D0-4FD6-BBA4-2F354332AF13}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Loshop; co-author: aoki
AppPublisherURL=https://github.com/nickfox395/ZhongYuToolBox_Web
AppSupportURL=https://github.com/nickfox395/ZhongYuToolBox_Web/issues
AppUpdatesURL=https://github.com/nickfox395/ZhongYuToolBox_Web/releases
DefaultDirName={localappdata}\Programs\ZhongYuToolbox-aoki
DefaultGroupName={#AppName}
DisableProgramGroupPage=no
DisableDirPage=no
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=ZhongYuToolBox-aoki-{#FileVersion}-Windows-x64-Setup
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern dynamic
InfoBeforeFile={#InstallNotes}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes
VersionInfoVersion={#NumericVersion}
VersionInfoDescription=中育工具箱 aoki Windows 安装程序
VersionInfoCompany=Loshop; co-author: aoki
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#NumericVersion}
VersionInfoProductTextVersion={#AppVersion}

[Languages]
Name: "chinesesimplified"; MessagesFile: "{#ChineseLanguage}"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："

[Files]
; Include explicit files only: never glob the user's profile or development workspace.
#include PayloadManifest
Source: "{#Bootstrapper}"; Flags: dontcopy

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{group}\卸载中育工具箱"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "启动中育工具箱"; Flags: nowait postinstall skipifsilent

[Code]
const
  RuntimeKey = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasWebView2: Boolean;
var
  Version: String;
begin
  Result := (RegQueryStringValue(HKLM32, RuntimeKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKLM64, RuntimeKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU32, RuntimeKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0'));
end;

function HasDotNet48: Boolean;
var
  Release: Cardinal;
begin
  Result := RegQueryDWordValue(HKLM32,
    'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', Release) and
    (Release >= 528040);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if not HasDotNet48 then begin
    Result := '需要 .NET Framework 4.8 或更新版本。请通过 Windows 更新，或从微软官网安装后重试：' + #13#10 +
      'https://dotnet.microsoft.com/download/dotnet-framework/net48';
    Exit;
  end;
  if HasWebView2 then begin
    Log('Microsoft Edge WebView2 Runtime detected; installation skipped.');
    Exit;
  end;
  WizardForm.StatusLabel.Caption := '正在安装 Microsoft Edge WebView2 Runtime（需要网络连接）…';
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'),
    '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    Result := '无法启动微软 WebView2 安装程序。请安装 WebView2 Runtime 后重试。';
    Exit;
  end;
  Log(Format('WebView2 bootstrapper exit code: %d', [ExitCode]));
  if not HasWebView2 then
    Result := '未检测到 WebView2 Runtime；微软安装程序返回 ' + IntToStr(ExitCode) + '。' + #13#10 +
      '请检查网络，或从 https://developer.microsoft.com/microsoft-edge/webview2/ 安装运行时后重试。';
end;

// No [UninstallDelete] rules: uninstall removes registered application files only.
// The separate WebView2 account/cache directory and user-created files are retained.
