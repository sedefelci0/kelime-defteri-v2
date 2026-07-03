# scripts/enrich-questions.ps1
# exam_questions.json dosyasini temizler ve zenginlestirir.

$ErrorActionPreference = 'Stop'
$dataFile = Join-Path $PSScriptRoot "..\data\exam_questions.json"

# --- UTF-8 oku ---
$json      = [System.IO.File]::ReadAllText($dataFile, [System.Text.Encoding]::UTF8)
$questions = $json | ConvertFrom-Json

# --- Yardimci fonksiyonlar ---

function Fix-Source([string]$src) {
    if (-not $src) { return $src }
    $src -replace 'YÃ–KDÄ°L','YOKDIL' -replace 'Ã–','Ö' -replace 'Ä°','İ'
}

function Extract-PassageTag([string]$text) {
    # Köşeli parantez: [Foo passage] veya [Foo passage: snippet...]
    if ($text -match '(?i)\s*\[([^\]:]+?passage[^\]:]*?)(?:\s*:[^\]]*)?\]\s*$') {
        return @{
            tag     = $Matches[1].Trim()
            cleaned = ($text -replace '(?i)\s*\[([^\]:]+?passage[^\]:]*?)(?:\s*:[^\]]*)?\]\s*$', '').Trim()
        }
    }
    # Yuvarlak parantez: (Foo passage)
    if ($text -match '(?i)\s*\(([^)]+?passage[^)]*?)\)\s*$') {
        return @{
            tag     = $Matches[1].Trim()
            cleaned = ($text -replace '(?i)\s*\(([^)]+?passage[^)]*?)\)\s*$', '').Trim()
        }
    }
    return $null
}

function Get-AvgOptionLen($q) {
    $vals = @($q.option_a,$q.option_b,$q.option_c,$q.option_d,$q.option_e) | Where-Object { $_ }
    if ($vals.Count -eq 0) { return 0 }
    ($vals | ForEach-Object { $_.Length } | Measure-Object -Average).Average
}

# --- Sayaçlar ---
$stats = @{
    passage_tags        = 0
    coherence           = 0
    cloze               = 0
    reading             = 0
    translation_en_tr   = 0
    translation_tr_en   = 0
    sentence_completion = 0
    vocabulary          = 0
    sources_fixed       = 0
}

$clozeBySource = @{}
$processed     = [System.Collections.Generic.List[object]]::new()
$idx           = 0

# --- 1. GECİS: her soruyu isle ---
foreach ($q in $questions) {

    # Soruyu kopyala (özellik sırası korunuyor)
    $r = [PSCustomObject]@{}
    foreach ($prop in $q.PSObject.Properties) {
        $r | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value
    }
    # Önceki çalıştırmadan kalan alanları temizle (idempotent çalışma)
    foreach ($f in @('question_type','passage_tag','passage_text','cloze_group')) {
        if ($r.PSObject.Properties[$f]) { $r.PSObject.Properties.Remove($f) }
    }

    # Kaynak düzelt
    $cleanSrc = Fix-Source ($r.source)
    if ($cleanSrc -ne $r.source) { $r.source = $cleanSrc; $stats.sources_fixed++ }

    $text        = if ($r.question_text) { $r.question_text } else { '' }
    $passageTag  = $null
    $questionType = $null

    # — Anlam butunlugu (coherence) —
    if ($text -match 'Anlam butunlugunu bozan cumleyi bulunuz\.?\s*$' -or
        $text -match '(?i)\[Anlam[^\]]+bozan[^\]]+[cC][^\]]*le\]\s*$') {

        $text = ($text -replace 'Anlam butunlugunu bozan cumleyi bulunuz\.?\s*$', '').Trim()
        $text = ($text -replace '(?i)\[Anlam[^\]]+bozan[^\]]+[cC][^\]]*le\]\s*$', '').Trim()
        $r.question_text = $text
        $questionType    = 'coherence'
        $stats.coherence++
    }
    # — Çeviri EN→TR —
    elseif ($text -match '(?i)\(Turkce karsiligini bulunuz\)\s*$') {
        $r.question_text = ($text -replace '(?i)\(Turkce karsiligini bulunuz\)\s*$', '').Trim()
        $questionType    = 'translation_en_tr'
        $stats.translation_en_tr++
    }
    # — Çeviri TR→EN —
    elseif ($text -match '(?i)\(Ingilizce karsiligini bulunuz\)\s*$' -or
            $text -match '(?i)\[En[^\]]+ngilizce[^\]]*eviriyi bulunuz\]\s*$') {
        $text = ($text -replace '(?i)\(Ingilizce karsiligini bulunuz\)\s*$', '').Trim()
        $text = ($text -replace '(?i)\[En[^\]]+ngilizce[^\]]*eviriyi bulunuz\]\s*$', '').Trim()
        $r.question_text = $text
        $questionType    = 'translation_tr_en'
        $stats.translation_tr_en++
    }
    else {
        # Passage etiketi çıkar
        $pt = Extract-PassageTag $text
        if ($pt) {
            $passageTag = $pt.tag
            $text       = $pt.cleaned
            $r.question_text = $text
            $r | Add-Member -NotePropertyName 'passage_tag'  -NotePropertyValue $passageTag
            $r | Add-Member -NotePropertyName 'passage_text' -NotePropertyValue $null
            $stats.passage_tags++
        }

        # Cloze: (21)---- ... (30)----
        if ($text -match '\(\d{2}\)----') {
            $questionType = 'cloze'
            $stats.cloze++
            $cloeNum = if ($text -match '\((\d{2})\)----') { [int]$Matches[1] } else { $null }
            $srcKey  = if ($r.source) { $r.source } else { '__unknown__' }
            if (-not $clozeBySource.ContainsKey($srcKey)) { $clozeBySource[$srcKey] = [System.Collections.Generic.List[object]]::new() }
            $clozeBySource[$srcKey].Add(@{ idx = $idx; cloeNum = $cloeNum; passageTag = $passageTag; ref = $r })
        }
        # Reading: passage etiketi var, cloze degil
        elseif ($passageTag) {
            $questionType = 'reading'
            $stats.reading++
        }
        # YOKDIL/YDS + boşluk → vocabulary vs sentence_completion
        elseif ($r.restrict_deck_slug -and $text -match '----') {
            $avg = Get-AvgOptionLen $q
            if ($avg -gt 50) {
                $questionType = 'sentence_completion'
                $stats.sentence_completion++
            } else {
                $questionType = 'vocabulary'
                $stats.vocabulary++
            }
        }
    }

    if ($questionType) {
        $r | Add-Member -NotePropertyName 'question_type' -NotePropertyValue $questionType
    }

    $processed.Add($r)
    $idx++
}

# --- 2. GECİS: cloze gruplarini yay ---
foreach ($srcKey in $clozeBySource.Keys) {
    $items = @($clozeBySource[$srcKey]) | Sort-Object { $_.idx }

    $currentGroupTag = $null
    $prevIdx         = -999

    foreach ($item in $items) {
        if (($item.idx - $prevIdx) -gt 10) { $currentGroupTag = $null }
        if ($item.passageTag)              { $currentGroupTag = $item.passageTag }

        $item.ref | Add-Member -NotePropertyName 'cloze_group' -NotePropertyValue $currentGroupTag -Force

        if ($currentGroupTag -and -not ($item.ref.PSObject.Properties['passage_tag'])) {
            $item.ref | Add-Member -NotePropertyName 'passage_tag'  -NotePropertyValue $currentGroupTag
            $item.ref | Add-Member -NotePropertyName 'passage_text' -NotePropertyValue $null
        }

        $prevIdx = $item.idx
    }
}

# --- Yaz (UTF-8, BOM yok) ---
$output = $processed.ToArray() | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($dataFile, $output, (New-Object System.Text.UTF8Encoding $false))

# --- Özet ---
$typed   = @($processed | Where-Object { $_.PSObject.Properties['question_type'] }).Count
$untyped = $processed.Count - $typed

Write-Host "`n=== exam_questions.json temizlendi ===" -ForegroundColor Cyan
Write-Host "Toplam soru             : $($processed.Count)"
Write-Host "Kaynak (source) düzeltme: $($stats.sources_fixed)"
Write-Host "Passage etiketi çıkarma : $($stats.passage_tags)"
Write-Host ""
Write-Host "Soru tipleri:" -ForegroundColor White
Write-Host "  vocabulary            : $($stats.vocabulary)"
Write-Host "  sentence_completion   : $($stats.sentence_completion)"
Write-Host "  cloze                 : $($stats.cloze)"
Write-Host "  reading               : $($stats.reading)"
Write-Host "  coherence             : $($stats.coherence)"
Write-Host "  translation_en_tr     : $($stats.translation_en_tr)"
Write-Host "  translation_tr_en     : $($stats.translation_tr_en)"
Write-Host "  Toplam etiketlenen    : $typed"
Write-Host "  Etiket verilmedi (LGS): $untyped" -ForegroundColor DarkGray
