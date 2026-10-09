<#
    open-md.ps1 — build a reading page for a Markdown file and open it in the reader.

    The two Windows launchers differ only in how they get a path:

        Open-MD-File.bat   drag a .md onto it, or pass it on the command line  -> -MdPath
        Open-Reader.bat    double-clicked                                      -> -Pick

    The reader is one self-contained HTML file, so a document is opened by injecting its
    text into a copy of that HTML (window.__PRELOAD_MD__) and opening the copy in the
    user's default browser. With -Pick and nothing selected, the reader itself is opened
    instead — both launchers end in the same place, one browser window.
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

function ConvertTo-JsLiteral([string]$Value) {
    ($Value | ConvertTo-Json -Compress).Replace('</', '<\/')
}

# Resolve where to write the generated HTML — alongside the md file so the browser's
# relative references (if any) keep working, and so the user sees where it came from.
function Get-OutDir([string]$ForMdPath) {
    if ($ForMdPath) {
        $dir = [IO.Path]::GetDirectoryName($ForMdPath)
        if ($dir -and (Test-Path -LiteralPath $dir)) { return $dir }
    }
    $readerDir = [IO.Path]::GetDirectoryName($Reader)
    if ($readerDir -and (Test-Path -LiteralPath $readerDir)) { return $readerDir }
    return [IO.Path]::GetTempPath()
}

if (-not $MdPath -and $Pick) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title  = 'Open Markdown file'
    $dialog.Filter = 'Markdown (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All files (*.*)|*.*'
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $MdPath = $dialog.FileName }
}

if (-not $MdPath) {
    # No file to open — just launch the bare reader
    Start-Process $Reader
    return
}

if (-not (Test-Path -LiteralPath $MdPath)) { throw "Markdown file not found: $MdPath" }

$html = [IO.File]::ReadAllText($Reader, [Text.Encoding]::UTF8)
$marker = '/* PARSER:BEGIN */'
$idx = $html.IndexOf($marker, [StringComparison]::Ordinal)
if ($idx -lt 0) { throw 'Reader script marker not found' }

$text = [IO.File]::ReadAllText($MdPath, [Text.Encoding]::UTF8)
$preload = "window.__PRELOAD_MD__ = $(ConvertTo-JsLiteral $text);`n" +
           "window.__PRELOAD_NAME__ = $(ConvertTo-JsLiteral ([IO.Path]::GetFileName($MdPath)));`n" +
           "window.__PRELOAD_PATH__ = $(ConvertTo-JsLiteral $MdPath);`n"

if (-not $Out) {
    $dir = Get-OutDir $MdPath
    $base = [IO.Path]::GetFileNameWithoutExtension($MdPath)
    $Out = Join-Path $dir ("$base.reader.html")
}

[IO.File]::WriteAllText($Out, $html.Substring(0, $idx) + $preload + $html.Substring($idx), [Text.UTF8Encoding]::new($false))

# ShellExecute = whatever handler the user registered for .html. That IS the default browser.
Start-Process $Out
