$f = 'c:\Users\bradv\Downloads\RoadrunnerParts-main (21)\app\ebay\[partNumber]\ListingEditor.jsx'
$c = [System.IO.File]::ReadAllText($f)
$lines = $c -split "`n"
foreach ($l in $lines) { if ($l -match 'AppliancePhotoCapture') { Write-Host $l.Trim() } }
