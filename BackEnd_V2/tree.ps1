# tree.ps1

$excludeDirs = @(
    "node_modules",
    ".git",
    "dist",
    ".firebase",
    ".vite",
    ".idea",
    ".vscode",
    "__pycache__",
    ".pytest_cache",
)

$excludeFiles = @(
    "package-lock.json",
    "tree.txt",
    "*.tsbuildinfo"
)

function Show-Tree {
    param(
        [string]$Path = ".",
        [string]$Indent = ""
    )

    $items = Get-ChildItem -LiteralPath $Path | Sort-Object @{ Expression = 'PSIsContainer'; Descending = $true }, @{ Expression = 'Name'; Descending = $false }

    foreach ($item in $items) {

        if ($item.PSIsContainer -and $excludeDirs -contains $item.Name) {
            continue
        }

        if (-not $item.PSIsContainer) {
            $skip = $false
            foreach ($pattern in $excludeFiles) {
                if ($item.Name -like $pattern) {
                    $skip = $true
                    break
                }
            }
            if ($skip) { continue }
        }

        Write-Output "$Indent|-- $($item.Name)"

        if ($item.PSIsContainer) {
            Show-Tree -Path $item.FullName -Indent "$Indent|   "
        }
    }
}

$projectName = Split-Path (Get-Location) -Leaf

$projectName | Set-Content tree.txt -Encoding UTF8
Show-Tree | Add-Content tree.txt

Write-Host "✅ tree.txt generated successfully."