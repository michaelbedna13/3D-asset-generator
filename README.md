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

## Ovládání

Rozhraní je klasický tmavý editor ve třech zónách:

- **Nahoře** je přepínač vzhledu `Point cloud` / `Shape raster`. Oba režimy jsou
  vidět vždy. Mrak bodů potřebuje obrázek, takže když je na plátně 3D objekt,
  přepnutí na `Point cloud` samo vybere obrázek.
- **Vlevo** jsou zdroje: `Open file…` (nebo přetažení souboru kamkoli), vaše
  otevřené soubory, tři ukázkové obrázky a devět vestavěných 3D objektů.
- **Uprostřed** je plátno a pod ním lišta s tím, co se týká pohledu: formát
  rámu, pohled kamery, zoom, přehrávání a tón okolí plátna.
- **Vpravo** jsou tři záložky: `Look` (vzhled), `Motion` (pohyb) a `Export`.
  V každé jsou jen skupiny, které platí pro to, co je zrovna na plátně.

Dvojklik na název posuvníku ho vrátí na výchozí hodnotu.

## Co to umí

| Oblast | Funkce |
| --- | --- |
| **Zdroje** | obrázek (PNG, JPG, WebP, SVG…), 3D model (`.glb`, `.gltf`, `.obj`, `.stl`, i `.gltf` + `.bin` + textury najednou, Draco i Meshopt), 3 ukázkové obrázky, 9 vestavěných objektů |
| **Point cloud** | obrázek jako až 520 tisíc svítících bodů s hloubkou: počet a velikost bodů, práh (`Cutoff`), rozptyl, barva z obrázku nebo jedna barva, svítivé nebo plné prolnutí, vinětace a zrno |
| **Hloubka** | výchozí odhad z jasu · `Estimate depth` spočítá skutečnou hloubku modelem přímo v prohlížeči · vlastní hloubková mapa (`Load map…`) · uložení mapy jako PNG (`Save map`) |
| **Shape raster** | obrázek nebo 3D model jako mřížka tvarů: velikost buňky, mezera, hustota, kontrast a tabulka čtyř úrovní (práh, tvar, velikost na jednom řádku) |
| **Vlastní ikony** | až 6 nahraných ikon (SVG / PNG) jako tvar kterékoli úrovně; obarví se barvou úrovně a ukládají se do presetu |
| **Barvy** | 9 barevných párů jako vzorníky, vlastní barva popředí (`Ink`) a pozadí (`Ground`), akcentní barva pro jednu úroveň |
| **Světlo** (3D) | 6 světelných sestav, úhel, expozice, stíny, occlusion, materiál clay / původní |
| **Motion** | turntable / sway / tumble, float; u mraku bodů rozlétnutí a složení (`Pulse` / `Sweep`) a drift; u rastru tónová vlna a shimmer; vše v bezešvé smyčce |
| **Export** | formáty 1:1, 4:5, 9:16, 16:9 · PNG (až 3×, i průhledné) · SVG (jen rastr) · GIF · MP4 (H.264) |
| **Workflow** | undo / redo, presety v JSON, nastavení se pamatuje mezi návštěvami |

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
   **`src/icons.js`** (ořez, převod na masku, obarvení). Styl point cloud je
   samostatně v **`src/cloud.js`** (vzorkování obrázku, odhad hloubky, shader).
4. **`src/export.js`** – animace se renderují snímek po snímku v přesných fázích
   smyčky (GIF přes `gifenc`, MP4 přes WebCodecs + `mp4-muxer`).

Velikost buňky se udává v px vůči kratší straně 1024, takže vzhled je stejný v
každém rozlišení i formátu.

## Odhad hloubky (`Estimate depth`)

Tlačítko je v záložce `Look`, skupina `Depth`, když je zapnutý vzhled `Point cloud`. Použije model **Depth Anything V2 Small**
(licence Apache-2.0, 8bitová ONNX verze od `onnx-community`) a běží celé v
prohlížeči přes ONNX Runtime (WebAssembly) ve workeru:

- při prvním použití se z Hugging Face stáhne model (27 MB) a uloží se do
  mezipaměti prohlížeče, další použití už nic nestahuje;
- obrázek zařízení neopouští, na server se nic neposílá;
- samotný výpočet trvá řádově sekundy na počítači, na telefonu déle;
- výsledná mapa jde uložit (`Save map`) a příště rovnou nahrát (`Load map…`).

Funkce je jen v běžném buildu (`npm run dev`, `npm run build`). V jednosouborové
verzi (`build:single`) chybí, protože ta si model stáhnout nemůže – tam poslouží
odhad z jasu nebo nahraná hloubková mapa.

## Nasazení

`npm run build` vytvoří statický web v `dist/`, který stačí nahrát na jakýkoli
hosting. Pro GitHub Pages je připravený workflow `.github/workflows/pages.yml`:
po sloučení do `main` a zapnutí *Settings → Pages → Source → GitHub Actions* se
appka při každém pushi sama sestaví a zveřejní.

## Vlastní brand a vzhled rozhraní

Barevné páry a výchozí hodnoty jsou v `src/state.js` (`PAIRINGS`,
`SHAPE_DEFAULTS`, `DEFAULTS`), obsah panelu v `src/schema.js`. Hotové nastavení
lze předat jako preset (`Save preset` → JSON, který se načte přetažením do okna).

Pravidla vzhledu rozhraní jsou sepsaná v `DESIGN.md` (barvy, písmo, komponenty,
co dělat a nedělat) a produktové zadání v `PRODUCT.md`. Barvy rozhraní jsou jako
CSS proměnné na začátku `src/style.css`.

## Poznámky

- MP4 export potřebuje WebCodecs (aktuální Chrome, Edge, Safari 16.4+, Firefox 130+).
- GIF má časování po 10 ms, proto jsou na výběr jen 10 / 20 / 25 fps.
- Vlastní ikony se do SVG exportu vkládají jako bitmapa (512 px), vestavěné tvary
  zůstávají čistý vektor.
- Point cloud nejde exportovat do SVG (statisíce bodů), použijte PNG / GIF / MP4.
- Obrázek je ve scéně jako plochá karta, takže na něj fungují pohledy, zoom i
  animace; světla, stíny a contact AO se u něj nepoužívají.
