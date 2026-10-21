# usage: powershell -ExecutionPolicy Bypass -File tools/tts-clips.ps1 -Out <dir>   (5 clips each from Windows TTS voices David + Zira, 16 kHz mono)
param([string]$Out)
Add-Type -AssemblyName System.Speech
$lines = @(
 "I'm drafting the point guard, put him on my team.",
 "Who is winning in our house right now?",
 "Put me down for the Hawks to score first tonight.",
 "How am I doing this season with my picks?",
 "Take the over, I think this game is going to be high scoring.")
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($v in @('Microsoft David Desktop','Microsoft Zira Desktop')) {
  $tag = if ($v -like '*David*') { 'david' } else { 'zira' }
  for ($i=0; $i -lt $lines.Count; $i++) {
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.SelectVoice($v); $s.Rate = [int](($i % 3) - 1)
    $s.SetOutputToWaveFile((Join-Path $Out "$tag-$i.wav"), $fmt); $s.Speak($lines[$i]); $s.Dispose()
  }
}
