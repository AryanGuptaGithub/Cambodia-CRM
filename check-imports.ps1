# check-imports.ps1 - Detect broken imports and case mismatches
$backendPath = "backend"
$files = Get-ChildItem -LiteralPath $backendPath -Recurse -File -Filter "*.js"

$mismatches = @()

foreach ($file in $files) {
    $content = Get-Content $file.FullName
    $imports = $content | Select-String -Pattern "import .* from ['\""](.*)['\""]"

    foreach ($import in $imports) {
        $importPath = $import.Matches.Groups[1].Value

        # Skip node_modules and external packages
        if ($importPath -match "^\.") {
            $fullPath = Join-Path $file.DirectoryName $importPath

            # Try with .js extension if not present
            if (-not $importPath.EndsWith(".js")) {
                $fullPath += ".js"
            }

            # Check if file exists (case-sensitive check)
            if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                # Check for case mismatch
                $actualCase = (Get-Item $fullPath).Name
                $expectedCase = Split-Path $fullPath -Leaf
                if ($actualCase -ne $expectedCase) {
                    $mismatches += "CASE MISMATCH in $($file.FullName): $importPath (expected case: $expectedCase, actual: $actualCase)"
                }
            } else {
                $mismatches += "MISSING FILE in $($file.FullName): $importPath"
            }
        }
    }
}

if ($mismatches.Count -eq 0) {
    Write-Host "✅ No broken imports found!" -ForegroundColor Green
} else {
    Write-Host "❌ Found $($mismatches.Count) issues:" -ForegroundColor Red
    $mismatches | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
}
