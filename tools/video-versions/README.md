# Flai videoversioner (Finder Quick Action)

Laver alle videoversioner lokalt med ffmpeg og pakker dem i én zip, så Cloudinary
ikke selv skal transkode dem. Hver forskellig leverings-URL er et afledt asset, som
Cloudinary transkoder og tæller som en transformation.

## Installér

```sh
brew install ffmpeg            # hvis du ikke har det
zsh tools/video-versions/install.sh
```

Højreklik en video i Finder → **Hurtighandlinger → Flai Videoversioner**.
Mangler den: System Settings → Privacy & Security → Extensions → Finder → slå den til.
Kan også køres direkte: `zsh tools/video-versions/flai-video-versions.sh film.mp4`.

Du får en notifikation ved start og når den er færdig. Zip'en lægges ved siden af
originalen som `<navn>.flai-versions.zip` og vises i Finder. Log: `~/Library/Logs/FlaiVideoVersions.log`.

## Hvor mange versioner: 11 filer pr. video

**3 størrelser × 3 formater = 9 videoer (alle med lyd), + 2 posters.**

Størrelserne er de tre `heroVideoTier()` i `src/utils/cloudinaryUrls.ts` vælger mellem
(`c_limit`, aldrig opskaleret; `mobile` har samme tal som `small`):

| Størrelse | Bredde | Bruges af                                                        |
| --------- | ------ | ---------------------------------------------------------------- |
| small     | 720    | portrætmobil, Data Saver, 2g/3g, og efter gentagne hakker        |
| medium    | 1280   | mobil i landskab, tablets, laptops og de fleste skærme           |
| large     | 1920   | brede skærme (over 1600 CSS-px)                                  |

Formaterne er dem Cloudinarys `f_auto` vælger mellem til video, afhængigt af browseren:

| Codec | Fil     | Gives af f_auto til                       |
| ----- | ------- | ----------------------------------------- |
| vp9   | `.webm` | Chrome og andre Chromium-browsere         |
| hevc  | `.mp4`  | Safari (macOS og iOS), mærket `hvc1`      |
| h264  | `.mp4`  | alle andre browsere (fallback)            |

AV1 er ikke med: Cloudinarys dokumentation nævner det ikke som en del af `f_auto` til video.

```
<navn>/
  video_720_vp9.webm    video_720_hevc.mp4    video_720_h264.mp4
  video_1280_vp9.webm   video_1280_hevc.mp4   video_1280_h264.mp4
  video_1920_vp9.webm   video_1920_hevc.mp4   video_1920_h264.mp4
  poster_960.jpg        960 bred, eco
  poster_1920.jpg       1920 bred, good
  manifest.json
```

`manifest.json` har én post pr. fil: slags, størrelse, kvalitet, codec, lyd, mime, bytes,
`audience` (hvem f_auto ville have givet den til) og `canPlayType` (til valg i browseren).
`publicId` er filnavnet uden endelse (mellemrum → `_`, kun `A-Z a-z 0-9 _ - .`).
Er originalen smallere end en størrelse, bliver den ikke opskaleret, så to filer kan være ens.

## Farver

Alle versioner ender som **SDR · 8 bit · yuv420p · limited range · BT.709**, og transfer-taggen
sættes eksplicit til **sRGB** (`iec61966-2-1`). Scriptet undersøger kilden med ffprobe og
omregner kun det, der afviger. Hvad der er gjort står i loggen (`FARVE …`) og i
`manifest.json` under `color`.

| Kilde | Hvad der sker |
|---|---|
| SDR BT.709, mangler transfer-tag (fx DaVinci Resolve) | Kun tag. Pixels ændres ikke. |
| BT.601 (SD) eller ukendt matrix | Omregnes til BT.709. Ukendt matrix: 709 fra 720 høj og op, ellers 601 (som afspillere gør). |
| Full range (`yuvj420p`) | Omregnes til limited. |
| RGB-kilde | Omregnes til YUV med BT.709-matrix (ffmpeg bruger ellers 601). |
| BT.2020-SDR, Display P3 | Primærfarver omregnes til BT.709. |
| 10/12 bit, 4:4:4, alpha (fx ProRes 4444) | 8 bit 4:2:0. Alpha fjernes. |
| HDR (PQ eller HLG) | Tonemappes til SDR via en 3D-LUT. |
| Gamma 2.2 / 2.8 / sRGB tagget i kilden | Kildens transfer-tag bevares. |

**Hvorfor sRGB-tagget:** Mangler kilden transfer-tag, viser Safari/QuickTime videoen lysere end
Chrome og Firefox. Målt på Safari 27, Chrome 157 og Firefox 151 giver `iec61966-2-1` ens
udseende i alle tre og ændrer ikke Chrome/Firefox. Et eksplicit BT.709-tag gør ingen forskel i
Safari. Taggen ændrer ingen pixels.

**Kendte begrænsninger**
- **Log-optagelser** (D-Log, S-Log, V-Log m.fl.) er normalt tagget som almindelig BT.709 og kan
  ikke genkendes. De konverteres ikke og ser flade ud, som originalen. Grade dem først.
- **HDR-tonemapping** er testet på syntetiske HLG/PQ-klip (rundtur), ikke på rigtigt HDR-materiale.
  Der antages 1000 nit mastering-peak og 203 nit som SDR-hvid. Ffmpeg her har ikke `zscale`.
- **Dolby Vision profil 5** understøttes ikke, og der gives en advarsel.
- Transfer `linear`, `log100`, `log316`, `smpte428`, `bt1361e`, `xvycc`: pixels er uændrede, og
  der gives en advarsel.
- Resolve skriver et `gama`-atom (2,4) i originalen, som QuickTime/Safari bruger til at vise den
  mørkere. Versionerne har det ikke, så originalen ser stadig lidt mørkere ud i Safari/QuickTime.
- Posters er JPEG (sRGB), tonemappet/omregnet som videoen, hvis kilden kræver det.

## Flag

```sh
FLAI_DRY=1  zsh tools/video-versions/flai-video-versions.sh film.mp4   # vis kun planen
FLAI_FAST=1 zsh tools/video-versions/flai-video-versions.sh film.mp4   # grove/hurtige indstillinger, kun til test
FLAI_CODECS="h264" zsh tools/video-versions/flai-video-versions.sh film.mp4   # kun nogle formater
```

HEVC og VP9 er langsomme at lave. En 4 sekunders 1080p-testvideo tog ca. 10 sekunder for hele
sættet; rigtigt optagelsesmateriale tager længere, så lad den køre i baggrunden.

## Status

Dette er kun den lokale del. At uploade zip'en til Cloudinary og at sitet bruger de
færdige filer i stedet for at lade Cloudinary lave dem, er **ikke koblet på endnu**.

## Hero på portrætmobil

- **Lodret sæt findes** (`FLAI_CROP=9:16`): ingen beskæring, så størrelsen vælges som for enhver anden fil (skærmbredde × tæthed).
- **Kun en vandret video:** der hentes kun det synlige udsnit (midterste 9:16, samme som `object-fit: cover` viser) i stedet for hele 16:9-billedet. Det er de eneste filer, der bruger en Cloudinary-transformation (`c_crop,ar_9:16` af `--fs`-rodfilen, 720 eller 1080 høj, i browserens codec). De laves ved første forespørgsel og kun af portrætmobiler. Drejes telefonen til landskab, hentes den fulde fil.
