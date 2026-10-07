param([string]$Manifest = (Join-Path $PSScriptRoot 'scenes.json'))
$ErrorActionPreference = 'Stop'
$demoManifest = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$demoAudioDir = Join-Path $PSScriptRoot 'audio'
New-Item -ItemType Directory -Path $demoAudioDir -Force | Out-Null
$demoVoice = New-Object -ComObject SAPI.SpVoice
$demoEnglishVoice = @($demoVoice.GetVoices() | Where-Object { $_.GetDescription() -match 'Zira.*English' })
if ($demoEnglishVoice.Count -ne 1) { throw 'Expected the inspected local Microsoft Zira English voice; no online fallback is allowed.' }
$demoVoice.Voice = $demoEnglishVoice[0]
$demoVoice.Rate = 1
$demoVoice.Volume = 92
foreach ($demoScene in $demoManifest.scenes) {
    for ($demoCueIndex = 0; $demoCueIndex -lt $demoScene.cues.Count; $demoCueIndex++) {
        $demoWavPath = Join-Path $demoAudioDir ('{0}-{1:D2}.wav' -f $demoScene.id, $demoCueIndex)
        $demoStream = New-Object -ComObject SAPI.SpFileStream
        $demoStream.Format.Type = 22 # 22.05kHz, 16-bit mono
        $demoStream.Open($demoWavPath, 3, $false)
        $demoVoice.AudioOutputStream = $demoStream
        [void]$demoVoice.Speak([string]$demoScene.cues[$demoCueIndex], 0)
        $demoStream.Close()
    }
    Write-Output ('Local narration generated: ' + $demoScene.id)
}
$demoVoice.AudioOutputStream = $null
Write-Output ('Voice: ' + $demoEnglishVoice[0].GetDescription())
