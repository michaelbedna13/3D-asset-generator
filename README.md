# RASTR Studio — 3D asset generator

Webový nástroj, který z libovolného 3D modelu nebo obrázku udělá brandovou
grafiku: předloha se převede na mřížku a každá buňka se podle tónu vykreslí jako
tečka, křížek, čtverec nebo vaše vlastní ikona. Výsledek jde exportovat jako **PNG, SVG, GIF nebo MP4**.

Všechno běží v prohlížeči – žádný server, žádné nahrávání souborů nikam ven.

## Spuštění

```bash
npm install
npm run dev        # vývojový server na http://localhost:5173
npm run build      # statický web do dist/ (jde nahrát na jakýkoli hosting)
npm run build:single   # celá appka jako jeden soubor dist-single/index.html
```

## Co to umí

| Oblast | Funkce |
| --- | --- |
| **Modely** | 9 vestavěných objektů, vlastní `.glb` / `.gltf` / `.obj` / `.stl` přes tlačítko `LOAD MODEL / IMAGE` nebo přetažením (i `.gltf` + `.bin` + textury najednou, Draco i Meshopt komprese) |
| **Obrázky** | fotka nebo logo (PNG, JPG, WebP, SVG…) jako předloha místo 3D modelu; režim `BRIGHTNESS` (rastr podle jasu) nebo `SOLID SHAPE` (silueta podle průhlednosti) |
| **Colours** | 8 barevných párů, vlastní barva popředí a pozadí, volitelná akcentní barva pro jednu úroveň |
| **Shapes** | velikost buňky, okraj, 4 tónové úrovně s vlastním prahem, tvarem a velikostí (tečka, kroužek, křížek, plus, čtverec, kosočtverec…), banding, dither, edge fade, contact AO |
| **Vlastní ikony** | až 6 nahraných ikon (SVG / PNG) použitelných jako tvar kterékoli úrovně; obarví se barvou úrovně a ukládají se do presetu |
| **Lighting** | 6 světelných presetů, úhel světla, expozice, stíny, materiál clay / původní |
| **Scene** | pohledy FRONT · 3/4 · SIDE · TOP · HERO, orbit myší / prstem, zoom, osa nahoru |
| **Animate** | turntable / sway / tumble, float, obíhající světlo, tónová vlna, shimmer – vše v bezešvé smyčce |
| **Export** | formáty 1:1, 4:5, 9:16, 16:9 · PNG (až 3×, i s průhledností) · SVG (vektor, každá úroveň zvlášť) · GIF · MP4 (H.264) |
| **Workflow** | undo / redo, uložení a načtení presetu jako JSON, nastavení se pamatuje mezi návštěvami |

### Klávesové zkratky

`E` PNG · `S` SVG · `G` GIF · `M` MP4 · `R` reset · `mezerník` play / pauza ·
`1`–`5` pohledy · `⌘/Ctrl+Z` zpět · `⇧⌘/Ctrl+Z` znovu

## Jak to funguje

1. **`src/stage.js`** – three.js scéna se vyrenderuje mimo obrazovku v nízkém
   rozlišení (pár vzorků na buňku mřížky) a přečte se zpět: tón, pokrytí a
   hloubka každé buňky.
2. **`src/halftone.js`** – z tónu se spočítá množství „inkoustu“ (včetně
   occlusion z hloubky, ditheru a animovaných efektů) a buňka dostane úroveň 0–4.
3. **`src/shapes.js`** – stejná geometrie tvarů se kreslí do canvasu i do SVG,
   takže náhled, rastrové exporty a vektor jsou totožné. Nahrané ikony řeší
   **`src/icons.js`** (ořez, převod na masku, obarvení).
4. **`src/export.js`** – animace se renderují snímek po snímku v přesných fázích
   smyčky (GIF přes `gifenc`, MP4 přes WebCodecs + `mp4-muxer`).

Velikost buňky se udává v px vůči kratší straně 1024, takže vzhled je stejný v
každém rozlišení i formátu.

## Vlastní brand

Barevné páry a výchozí hodnoty jsou v `src/state.js` (`PAIRINGS`,
`SHAPE_DEFAULTS`, `DEFAULTS`), popis panelu v `src/schema.js`, barvy rozhraní
jako CSS proměnné na začátku `src/style.css`. Hotové nastavení lze klientovi
předat jako preset (`SAVE PRESET` → JSON, který se načte přetažením do okna).

## Poznámky

- MP4 export potřebuje WebCodecs (aktuální Chrome, Edge, Safari 16.4+, Firefox 130+).
- GIF má časování po 10 ms, proto jsou na výběr jen 10 / 20 / 25 fps.
- Vlastní ikony se do SVG exportu vkládají jako bitmapa (512 px), vestavěné tvary
  zůstávají čistý vektor.
- Obrázek je ve scéně jako plochá karta, takže na něj fungují pohledy, zoom i
  animace; světla, stíny a contact AO se u něj nepoužívají.
