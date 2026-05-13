$f = 'c:\Users\bradv\Downloads\RoadrunnerParts-main (21)\app\ebay\[partNumber]\ListingEditor.jsx'
$c = [System.IO.File]::ReadAllText($f)

# 1. Add import after ListingGallery import
if ($c -notmatch 'AppliancePhotoCapture') {
    $c = $c.Replace(
        "import ListingGallery from `"./ListingGallery`";",
        "import ListingGallery from `"./ListingGallery`";`r`nimport AppliancePhotoCapture from `"@/src/features/identity/AppliancePhotoCapture`";"
    )
    Write-Host "import added"
} else {
    Write-Host "import already present"
}

# 2. Insert the photo panel block just before the Quality Score card inside the sidebar
$photoPanel = @"
            {/* Photo Capture Panel */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Appliance Photos</label>
              <AppliancePhotoCapture
                compact={true}
                onFeatureCues={(cues) => {
                  if (!cues) return;
                  console.debug('[ListingEditor] feature cues:', cues);
                }}
              />
            </div>

"@

$anchor = '            {/* Quality Score */}'
if ($c -notmatch [regex]::Escape('AppliancePhotoCapture compact')) {
    $c = $c.Replace($anchor, $photoPanel + $anchor)
    Write-Host "panel inserted"
} else {
    Write-Host "panel already present"
}

[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "done"
