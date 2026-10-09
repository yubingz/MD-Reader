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
if ($Reader -notmatch '^[A-Za-z][A-Za-z0-9+.\-]*:') {
    $Reader = (Resolve-Path -LiteralPath $Reader).Path
}
if (-not (Test-Path -LiteralPath $Reader)) { throw "Reader not found: $Reader" }

function ConvertTo-JsLiteral([string]$Value) {
    ($Value | ConvertTo-Json -Compress).Replace('</', '<\/')
}

# Where the launcher looks for an optional local KaTeX distribution, next to this script.
# katex.min.js/katex.min.css come from the official @0.16.11 dist (byte-for-byte).
function Get-KatexDir {
    $candidates = @()
    if ($env:MDR_KATEX) { $candidates += $env:MDR_KATEX }
    if ($PSScriptRoot) { $candidates += (Join-Path $PSScriptRoot 'katex') }
    foreach ($dir in $candidates) {
        if ((Test-Path -LiteralPath (Join-Path $dir 'katex.min.js')) -and
            (Test-Path -LiteralPath (Join-Path $dir 'katex.min.css'))) { return $dir }
    }
    return $null
}

# Inline KaTeX into the page so file:/// never needs the network.
#
# The KaTeX script tag is inserted immediately BEFORE the reader's own inline <script>, so
# window.katex exists before the reader runs while "use strict" stays the first statement of
# the reader's own script (we only ever insert a sibling tag, never edit that one).
#
# The anchor is the reader's own script opening tag. It is matched as one whole string
# against the source text, so a document that merely contains "<script>" inside a code fence
# cannot shift the insertion point; only the real tag matches.
function Add-KatexInline([string]$Html, [string]$KatexDir) {
    if (-not $KatexDir) { return $Html }
    $js = [IO.File]::ReadAllText((Join-Path $KatexDir 'katex.min.js'), [Text.Encoding]::UTF8)
    $css = [IO.File]::ReadAllText((Join-Path $KatexDir 'katex.min.css'), [Text.Encoding]::UTF8)

    $headEndTag = '</head>'
    $styleTag = '<style id="katex-style">' + $css + '</style>'
    $scriptTag = '<script id="katex-inline">' + $js + '</script>'

    $withCss = $Html.Replace($headEndTag, $styleTag + $headEndTag)

    # md-reader.html ships CRLF (pinned in .gitattributes), so the reader script opens with a
    # CR LF after the tag. Check that form first, then the LF form, then the bare tag, in case a
    # future edit or a different checkout normalises the file's line endings.
    $crlf = '<script>' + [char]13 + [char]10
    if ($withCss.Contains($crlf)) { return $withCss.Replace($crlf, $scriptTag + $crlf) }
    $lf = '<script>' + [char]10
    if ($withCss.Contains($lf)) { return $withCss.Replace($lf, $scriptTag + $lf) }
    $bare = '<script>'
    return $withCss.Replace($bare, $scriptTag + $bare)
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

# Pick a markdown file. Uses the current directory when it holds markdown files (Windows
# applications do this), otherwise the user's Documents folder. Returns $null on cancel.
function Select-MdFile {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Open a Markdown file'
    $dialog.Filter = 'Markdown (*.md;*.markdown;*.txt)|*.md;*.markdown;*.txt|All files (*.*)|*.*'
    $here = (Get-Location).Path
    $hasMdHere = $false
    if ($here) {
        $hasMdHere = @(Get-ChildItem -LiteralPath $here -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in '.md', '.markdown', '.txt' }).Count -gt 0
    }
    if ($hasMdHere) { $dialog.InitialDirectory = $here }
    else { $dialog.InitialDirectory = [Environment]::GetFolderPath('MyDocuments') }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.FileName }
    return $null
}

# A Windows shortcut can pass its "Start in" folder as the working directory, and dragging a
# file onto Open-Reader.bat passes the path as the first argument. Both end up as -MdPath.
if (-not $MdPath -and $Pick) { $MdPath = Select-MdFile }

if (-not $MdPath) {
    # No file to open — just launch the bare reader
    Start-Process $Reader
    return
}

if (-not (Test-Path -LiteralPath $MdPath)) { throw "Markdown file not found: $MdPath" }

$html = [IO.File]::ReadAllText($Reader, [Text.Encoding]::UTF8)

# Inline KaTeX when a local distribution is present (the shipped katex/ folder), so the
# generated page typesets formulas with no network access at all.
$katexDir = Get-KatexDir
if ($katexDir) { $html = Add-KatexInline $html $katexDir }

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
