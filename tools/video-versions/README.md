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

## Hvad der kommer i zip'en

Det samme sæt sitet bruger i dag (`src/utils/cloudinaryUrls.ts`, `api/_lib/cloudinaryWarm.js`):
ét format, tre størrelser, lyd på alle. Bredden er `c_limit` (aldrig opskaleret).

```
<navn>/
  video_720_h264.mp4     small   (portrætmobil, Data Saver, 2g/3g)
  video_1280_h264.mp4    medium  (de fleste skærme)
  video_1920_h264.mp4    large   (brede skærme)
  poster_960.jpg         960 bred, eco
  poster_1920.jpg        1920 bred, good
  manifest.json          én post pr. fil: slags, størrelse, kvalitet, codec, lyd, mime, bytes
```

`publicId` i manifestet er filnavnet uden endelse (mellemrum → `_`, kun `A-Z a-z 0-9 _ - .`).
Er originalen smallere end en størrelse, bliver den ikke opskaleret, så to filer kan være ens.

## Flag

```sh
FLAI_DRY=1  zsh tools/video-versions/flai-video-versions.sh film.mp4   # vis kun planen
FLAI_FAST=1 zsh tools/video-versions/flai-video-versions.sh film.mp4   # grove/hurtige indstillinger, kun til test
FLAI_CODECS="h264 hevc vp9" zsh tools/video-versions/flai-video-versions.sh film.mp4   # flere formater
```

Standard er kun `h264`, fordi det er det eneste format sitet leverer. `hevc` (Safari) og `vp9`
(WebM) er med til hvis sitet en dag skifter tilbage til flere formater. HEVC og VP9 er langsomme.

## Status

Dette er kun den lokale del. At uploade zip'en til Cloudinary og at sitet bruger de
færdige filer i stedet for at lade Cloudinary lave dem, er **ikke koblet på endnu**.
