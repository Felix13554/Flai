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
