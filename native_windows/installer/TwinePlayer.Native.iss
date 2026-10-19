; Build through tools/package-installer.ps1 using an immutable portable release.
[Setup]
AppId={{B29F972B-8A70-4F5A-A457-A7E7D2247689}
AppName=TwinePlayer
AppVersion={#AppVersion}
AppVerName=TwinePlayer {#DisplayVersion}
AppPublisher=YUUKWN
AppPublisherURL=https://github.com/YuuKwn/TwinePlayer
AppSupportURL=https://github.com/YuuKwn/TwinePlayer/issues
AppUpdatesURL=https://github.com/YuuKwn/TwinePlayer/releases
VersionInfoVersion={#AppVersion}
VersionInfoDescription=TwinePlayer {#DisplayVersion} Setup
DefaultDirName={localappdata}\Programs\TwinePlayer
DefaultGroupName=TwinePlayer
PrivilegesRequired=lowest
MinVersion=10.0.22621
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
SetupArchitecture=x64
OutputDir={#OutputDirectory}
OutputBaseFilename={#InstallerName}
SetupIconFile=..\src\TwinePlayer.App\Assets\app_icon.ico
UninstallDisplayIcon={app}\TwinePlayer.Native.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dynamic
DisableProgramGroupPage=yes
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Languages]
Name: english; MessagesFile: compiler:Default.isl

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PayloadDirectory}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BootstrapperPath}"; DestName: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{userprograms}\TwinePlayer"; Filename: "{app}\TwinePlayer.Native.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\TwinePlayer"; Filename: "{app}\TwinePlayer.Native.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[InstallDelete]
; Replace the previous native preview's shortcut names during an upgrade.
Type: files; Name: "{userprograms}\TwinePlayer Native.lnk"
Type: files; Name: "{userdesktop}\TwinePlayer Native.lnk"

[Run]
Filename: "{app}\TwinePlayer.Native.exe"; Description: "{cm:LaunchProgram,TwinePlayer}"; Flags: nowait postinstall skipifsilent

; No directory-wide deletion: only installer-owned files are removed. The native
; profile, external games, sidecar saves and shared WebView2 Runtime are retained.
[Code]
function HasWebView2: Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKLM32, Key, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0'));
  if not Result then
    Result := (RegQueryStringValue(HKCU32, Key, 'pv', Version) and
      (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if HasWebView2 then begin
    Log('WebView2 Runtime is already installed; bootstrapper skipped.');
    exit;
  end;
  WizardForm.StatusLabel.Caption := 'Installing Microsoft Edge WebView2 Runtime...';
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  Log('WebView2 Runtime is missing; running the bundled Microsoft bootstrapper.');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'),
      '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    Result := 'Microsoft Edge WebView2 Runtime could not be started. ' +
      'Please retry Setup or install the Runtime from https://developer.microsoft.com/microsoft-edge/webview2/.';
    exit;
  end;
  Log(Format('WebView2 bootstrapper returned %d.', [ExitCode]));
  if not HasWebView2 then
    Result := 'Microsoft Edge WebView2 Runtime is required and could not be installed. ' +
      'Check your Internet connection and retry Setup. For an offline PC, install the x64 Evergreen Standalone Runtime from ' +
      'https://developer.microsoft.com/microsoft-edge/webview2/ before retrying.';
end;
