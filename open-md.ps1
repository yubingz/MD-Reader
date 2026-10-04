<#
    open-md.ps1 — build a reading page for a Markdown file and open it in the reader.

    The two Windows launchers differ only in how they get a path:

        Open-MD-File.bat   drag a .md onto it, or pass it on the command line  -> -MdPath
        Open-Reader.bat    double-clicked                                      -> -Pick

    The reader is one self-contained HTML file, so a document is opened by injecting its
    text into a copy of that HTML (window.__PRELOAD_MD__) and opening the copy in Edge app
    mode. With -Pick and nothing selected, the reader itself is opened instead — both
    launchers end in the same place, one app window.
#>
param(
    [string]$MdPath,
    [string]$Reader,
    [string]$Out,
    [switch]$Pick
)

$ErrorActionPreference = 'Stop'

if (-not $Reader) { $Reader = Join-Path $PSScriptRoot 'md-reader.html' }
if (-not (Test-Path -LiteralPath $Reader)) { throw "Reader not found: $Reader" }

function Open-InReader([string]$Target) {
    # Edge app mode makes this feel like a small desktop tool; anything else is a fallback.
    # Going through [Uri] keeps spaces, non-ASCII and '#' in the path intact.
    $uri = [Uri]::new($Target).AbsoluteUri
    $edge = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

    if ($edge) {
        Start-Process -FilePath $edge -ArgumentList @("--app=`"$uri`"")
    } else {
        Start-Process $uri
    }
}

function ConvertTo-JsLiteral([string]$Value) {
    # ConvertTo-Json escapes everything a JavaScript string literal needs except "</",
    # which would close the surrounding <script> element early. "<\/" is that same string.
    ($Value | ConvertTo-Json -Compress).Replace('</', '<\/')
}

if (-not $MdPath -and $Pick) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title  = 'Open Markdown file'
    $dialog.Filter = 'Markdown (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All files (*.*)|*.*'
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $MdPath = $dialog.FileName }
}

if (-not $MdPath) {
    Open-InReader $Reader
    return
}

if (-not (Test-Path -LiteralPath $MdPath)) { throw "Markdown file not found: $MdPath" }

$html = [IO.File]::ReadAllText($Reader, [Text.Encoding]::UTF8)
$marker = '(function () {'
$idx = $html.IndexOf($marker, [StringComparison]::Ordinal)
if ($idx -lt 0) { throw 'Reader script marker not found' }

$text = [IO.File]::ReadAllText($MdPath, [Text.Encoding]::UTF8)
$preload = "window.__PRELOAD_MD__ = $(ConvertTo-JsLiteral $text);`n" +
           "window.__PRELOAD_NAME__ = $(ConvertTo-JsLiteral ([IO.Path]::GetFileName($MdPath)));`n" +
           "window.__PRELOAD_PATH__ = $(ConvertTo-JsLiteral $MdPath);`n"

if (-not $Out) {
    $Out = Join-Path ([IO.Path]::GetTempPath()) ("md-reader-" + [Guid]::NewGuid().ToString('N').Substring(0, 8) + ".html")
}

[IO.File]::WriteAllText($Out, $html.Substring(0, $idx) + $preload + $html.Substring($idx), [Text.UTF8Encoding]::new($false))
Write-Output $Out

Open-InReader $Out
