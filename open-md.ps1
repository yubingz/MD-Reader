param(
    [Parameter(Mandatory = $true)][string]$MdPath,
    [Parameter(Mandatory = $true)][string]$Reader,
    [Parameter(Mandatory = $true)][string]$Out
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $MdPath)) { throw "Markdown file not found: $MdPath" }
if (-not (Test-Path -LiteralPath $Reader)) { throw "Reader not found: $Reader" }

$text = [IO.File]::ReadAllText($MdPath, [Text.Encoding]::UTF8)
$html = [IO.File]::ReadAllText($Reader, [Text.Encoding]::UTF8)

$name = [IO.Path]::GetFileName($MdPath)
$jsonText  = ($text  | ConvertTo-Json -Compress)
$jsonName  = ($name  | ConvertTo-Json -Compress)
$jsonPath  = ($MdPath | ConvertTo-Json -Compress)

$preload = "window.__PRELOAD_MD__ = $jsonText;`n" +
           "window.__PRELOAD_NAME__ = $jsonName;`n" +
           "window.__PRELOAD_PATH__ = $jsonPath;`n"

# 注入到主脚本 IIFE 之前，保证加载时已能读到预载内容
$marker = '(function () {'
$idx = $html.IndexOf($marker, [StringComparison]::Ordinal)
if ($idx -lt 0) { throw 'Reader script marker not found' }

$updated = $html.Substring(0, $idx) + $preload + $html.Substring($idx)
[IO.File]::WriteAllText($Out, $updated, [Text.UTF8Encoding]::new($false))
Write-Output $Out
