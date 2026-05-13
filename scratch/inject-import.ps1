$f = 'c:\Users\bradv\Downloads\RoadrunnerParts-main (21)\src\App.tsx'
# Read as bytes, convert to string to preserve CRLF accurately
$bytes = [System.IO.File]::ReadAllBytes($f)
$c = [System.Text.Encoding]::UTF8.GetString($bytes)

$oldLine = "import { ebaySearchUrl, ebaySoldSearchUrl } from './features/bom/services/ebay-links';"
$newLines = "import { ebaySearchUrl, ebaySoldSearchUrl } from './features/bom/services/ebay-links';`r`nimport AppliancePhotoCapture from './features/identity/AppliancePhotoCapture';"

# Check if the import is correctly placed (should follow the ebay-links line)
$alreadyCorrect = $c -match [regex]::Escape("ebay-links';`r`nimport AppliancePhotoCapture")
if ($alreadyCorrect) {
    Write-Host "Already correct"
    exit 0
}

# Remove any orphaned AppliancePhotoCapture import first (from failed prior attempt)
$c = $c -replace "import AppliancePhotoCapture from './features/identity/AppliancePhotoCapture';\r\n", ""
$c = $c -replace "import AppliancePhotoCapture from './features/identity/AppliancePhotoCapture';\n", ""

# Now insert in the right place
if ($c.Contains($oldLine)) {
    $c = $c.Replace($oldLine, $newLines)
    $outBytes = [System.Text.Encoding]::UTF8.GetBytes($c)
    [System.IO.File]::WriteAllBytes($f, $outBytes)
    Write-Host "Done - import inserted after ebay-links"
} else {
    Write-Host "ERROR: anchor line not found"
}
