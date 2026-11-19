param(
    [string]$ProjectRoot = "C:\Users\ligua\Documents\Trae-CN\temp_20261119_01\cooking-miniapp"
)

$ErrorActionPreference = 'Stop'
$skipDirs = @('.git', 'node_modules', 'miniprogram_npm', '.agents', '.claude', '.workbuddy')
$script:errors = 0
$script:warns = 0

function Get-ProjectFiles {
    param([string[]]$Patterns)
    Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Force -Include $Patterns -ErrorAction SilentlyContinue |
        Where-Object {
            $rel = $_.FullName.Substring($ProjectRoot.Length).TrimStart('\')
            $parts = $rel -split '\\'
            -not ($parts | Where-Object { $skipDirs -contains $_ })
        }
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    Write-Output "FAIL: project root not found: $ProjectRoot"
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Output "FAIL: node not found in PATH"
    exit 1
}
Write-Output "node $(node --version)"

# 1. JS 语法
$jsFiles = Get-ProjectFiles @('*.js')
$jsFail = 0
foreach ($f in $jsFiles) {
    $out = & node --check $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) {
        $jsFail++
        Write-Output ("SYNTAX  {0}" -f $f.FullName.Substring($ProjectRoot.Length).TrimStart('\'))
        $out | Select-Object -First 3 | ForEach-Object { Write-Output ("         {0}" -f $_) }
    }
}
Write-Output ("JS      {0} files, {1} syntax errors" -f $jsFiles.Count, $jsFail)
$script:errors += $jsFail

# 2. JSON 可解析
$jsonFiles = Get-ProjectFiles @('*.json')
$jsonFail = 0
foreach ($f in $jsonFiles) {
    try {
        Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop | Out-Null
    } catch {
        $jsonFail++
        Write-Output ("JSON    {0} :: {1}" -f $f.FullName.Substring($ProjectRoot.Length).TrimStart('\'), $_.Exception.Message)
    }
}
Write-Output ("JSON    {0} files, {1} parse errors" -f $jsonFiles.Count, $jsonFail)
$script:errors += $jsonFail

# 3. app.json 页面四件套
$appJson = Get-Content -LiteralPath (Join-Path $ProjectRoot 'app.json') -Raw | ConvertFrom-Json
$missing = 0
foreach ($page in $appJson.pages) {
    foreach ($ext in @('.js', '.json', '.wxml', '.wxss')) {
        $path = Join-Path $ProjectRoot ($page + $ext)
        if (-not (Test-Path -LiteralPath $path)) {
            $missing++
            Write-Output ("PAGE    missing {0}{1}" -f $page, $ext)
        }
    }
}
Write-Output ("PAGES   {0} registered, {1} missing files" -f $appJson.pages.Count, $missing)
$script:errors += $missing

# 4. 页面越层直调 wx.cloud
$layerHits = @()
Get-ProjectFiles @('*.js') | Where-Object { $_.FullName -match '\\pages\\' } | ForEach-Object {
    $rel = $_.FullName.Substring($ProjectRoot.Length).TrimStart('\')
    $hit = Select-String -LiteralPath $_.FullName -Pattern 'wx\.cloud\.' -ErrorAction SilentlyContinue
    if ($hit) { $layerHits += ("{0}:{1}" -f $rel, $hit[0].LineNumber) }
}
if ($layerHits.Count) {
    $script:warns += $layerHits.Count
    $layerHits | ForEach-Object { Write-Output ("LAYER   page calls wx.cloud directly: {0}" -f $_) }
} else {
    Write-Output "LAYER   pages go through utils/store.js only"
}

# 5. 详情页加载态守卫
$detailWxml = Join-Path $ProjectRoot 'pages\detail\detail.wxml'
if (Test-Path -LiteralPath $detailWxml) {
    $raw = Get-Content -LiteralPath $detailWxml -Raw
    if ($raw -notmatch 'wx:elif="\{\{!loading\}\}"') {
        $script:warns++
        Write-Output "GUARD   detail.wxml: not-found branch should use wx:elif=\"{{!loading}}\" (real-device flash risk)"
    } else {
        Write-Output "GUARD   detail.wxml keeps loading-aware not-found branch"
    }
}

# 6. packOptions.ignore 仍在
$projCfg = Get-Content -LiteralPath (Join-Path $ProjectRoot 'project.config.json') -Raw | ConvertFrom-Json
$ignored = @()
if ($projCfg.packOptions -and $projCfg.packOptions.ignore) { $ignored = $projCfg.packOptions.ignore | ForEach-Object { $_.value } }
foreach ($dir in @('seed', 'seed-images', 'seed-images-c')) {
    if ($ignored -notcontains $dir) {
        $script:warns++
        Write-Output ("PACK    {0} not in packOptions.ignore" -f $dir)
    }
}
Write-Output ("PACK    ignored: {0}" -f ($ignored -join ', '))

Write-Output ""
if ($script:errors -gt 0) {
    Write-Output ("RESULT  FAIL ({0} errors, {1} warnings)" -f $script:errors, $script:warns)
    exit 1
}
Write-Output ("RESULT  PASS (0 errors, {0} warnings)" -f $script:warns)
exit 0
