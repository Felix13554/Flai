#!/bin/zsh
#
# flai-video-versions.sh
#
# Laver ALLE videoversioner lokalt (ffmpeg) og pakker dem i én zip pr. video,
# så Cloudinary ikke selv skal transkode dem (hver afledt URL koster en
# transformation).
#
#   flai-video-versions.sh <video> [<video> ...]
#
# Sættet svarer til det sitet bruger i dag (src/utils/cloudinaryUrls.ts og
# api/_lib/cloudinaryWarm.js): ét format, tre størrelser, lyd på alle.
#
#   video_720_h264.mp4    small   (c_limit, aldrig opskaleret)
#   video_1280_h264.mp4   medium
#   video_1920_h264.mp4   large
#   poster_960.jpg        960 bred, eco
#   poster_1920.jpg       1920 bred, good
#   manifest.json         beskriver hver fil præcist
#
# Resultat: <navn>.flai-versions.zip ved siden af originalen, med mappen <navn>/ indeni.
#
# Miljøvariabler:
#   FLAI_CODECS="h264 vp9 hevc"   flere formater (standard: kun h264, som sitet bruger)
#   FLAI_FAST=1                   hurtige/grove encoder-indstillinger (kun til test)
#   FLAI_DRY=1                    vis kun planen, lav ingenting
#
# NB: Ændrer du tiers/kvalitet i cloudinaryUrls.ts, så ret TIER_W her også.

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

GENERATOR_VERSION=2
LOG="$HOME/Library/Logs/FlaiVideoVersions.log"
mkdir -p "$HOME/Library/Logs"

typeset -A TIER_W
TIER_W=(small 720 medium 1280 large 1920)
TIERS=(small medium large)
POSTERS=(960:eco:5 1920:good:3)          # bredde:kvalitet:jpeg-q (lavere q = bedre)
CODECS=(${=FLAI_CODECS:-h264})

for c in $CODECS; do
  [[ $c == (h264|hevc|vp9) ]] || { print "Ukendt codec: $c (brug h264, hevc eller vp9)" >&2; exit 1 }
done

if [[ ${FLAI_FAST:-0} == 1 ]]; then
  VP9_ARGS=(-deadline realtime -cpu-used 8); X264_PRESET=veryfast; X265_PRESET=ultrafast
else
  VP9_ARGS=(-deadline good -cpu-used 3);     X264_PRESET=medium;   X265_PRESET=medium
fi

log() { print -r -- "$(date '+%F %T') $*" >> "$LOG" }

notify() {
  local sub msg
  sub=$(print -r -- "$1" | tr -d '"\\')
  msg=$(print -r -- "$2" | tr -d '"\\')
  /usr/bin/osascript -e "display notification \"$msg\" with title \"Flai videoversioner\" subtitle \"$sub\"" >/dev/null 2>&1
}

# Kvalitet "good" (som q_auto:good). Tal er CRF: lavere = bedre/større.
crf_for() {
  case "$1" in
    h264) echo 24 ;;
    hevc) echo 27 ;;
    vp9)  echo 33 ;;
  esac
}

# encode <src> <out> <width> <codec>
encode() {
  local src=$1 out=$2 w=$3 codec=$4 crf
  crf=$(crf_for "$codec")
  # c_limit: aldrig bredere end tieren, aldrig opskaleret, lige dimensioner.
  local vf="scale='trunc(min($w,iw)/2)*2':-2:flags=lanczos,format=yuv420p"
  local -a venc audio
  case $codec in
    vp9)  venc=(-c:v libvpx-vp9 -crf $crf -b:v 0 -row-mt 1 $VP9_ARGS)
          audio=(-map '0:a:0?' -c:a libopus -b:a 96k) ;;
    hevc) venc=(-c:v libx265 -crf $crf -preset $X265_PRESET -tag:v hvc1 -x265-params log-level=error -movflags +faststart)
          audio=(-map '0:a:0?' -c:a aac -b:a 128k) ;;
    h264) venc=(-c:v libx264 -crf $crf -preset $X264_PRESET -movflags +faststart)
          audio=(-map '0:a:0?' -c:a aac -b:a 128k) ;;
  esac
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" \
    -map 0:v:0 -vf "$vf" $venc $audio -map_metadata -1 "$out" >> "$LOG" 2>&1
}

process() {
  local src=$1
  local dir=${src:h} base=${${src:t}%.*} slug zip work out tsv
  slug=$(print -r -- "$base" | sed -E 's/[[:space:]]+/_/g; s/[^A-Za-z0-9_.-]//g')
  [[ -n $slug ]] || slug=video
  zip="$dir/$slug.flai-versions.zip"

  if ! ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "$src" 2>/dev/null | grep -q video; then
    notify "$base" "Filen har intet videospor"; log "SKIP $src (intet videospor)"; return 1
  fi

  local -a plan=()
  local t c
  for t in $TIERS; do for c in $CODECS; do plan+=("$t $c"); done; done
  local total=$(( ${#plan} + ${#POSTERS} ))

  if [[ ${FLAI_DRY:-0} == 1 ]]; then
    print "Plan for $src → $zip  ($total filer + manifest)"
    local item; for item in $plan; do print "  video $item  (${TIER_W[${item%% *}]} bred)"; done
    local p; for p in $POSTERS; do print "  poster ${p%%:*}"; done
    return 0
  fi

  work=$(mktemp -d "${TMPDIR:-/tmp}/flai-versions.XXXXXX") || return 1
  out="$work/$slug"; mkdir -p "$out"
  tsv="$work/files.tsv"; : > "$tsv"
  local started=$SECONDS n=0 item tier codec ext file w
  local -a parts

  log "START $src ($total filer)"
  notify "$base" "Starter: $total filer. Det kan tage et par minutter."

  for item in $plan; do
    parts=(${(s: :)item}); tier=$parts[1]; codec=$parts[2]
    w=$TIER_W[$tier]
    ext=mp4; [[ $codec == vp9 ]] && ext=webm
    file="video_${w}_${codec}.${ext}"
    n=$(( n + 1 )); log "[$n/$total] $file"
    if ! encode "$src" "$out/$file" "$w" "$codec"; then
      log "FEJL $file"; notify "$base" "Fejlede ved $file. Se ~/Library/Logs/FlaiVideoVersions.log"
      rm -rf "$work"; return 1
    fi
    print -- "$file\tvideo\t$tier\t$w\tgood\t$codec\ttrue" >> "$tsv"
  done

  local p pw pq pj
  for p in $POSTERS; do
    parts=(${(s.:.)p}); pw=$parts[1]; pq=$parts[2]; pj=$parts[3]
    file="poster_${pw}.jpg"; n=$(( n + 1 )); log "[$n/$total] $file"
    if ! ffmpeg -nostdin -hide_banner -loglevel error -y -ss 0 -i "$src" -frames:v 1 \
         -vf "scale='trunc(min($pw,iw)/2)*2':-2:flags=lanczos" -q:v $pj "$out/$file" >> "$LOG" 2>&1; then
      log "FEJL $file"; notify "$base" "Fejlede ved $file"; rm -rf "$work"; return 1
    fi
    print -- "$file\tposter\t$pw\t$pw\t$pq\tjpeg\tfalse" >> "$tsv"
  done

  python3 - "$work" "$slug" "${src:t}" "$GENERATOR_VERSION" "$src" <<'FLAI_PY_EOF'
import json, os, subprocess, sys, datetime
work, slug, src_name, gen_version, src_path = sys.argv[1:6]
out = os.path.join(work, slug)
mimes = {"webm": "video/webm", "mp4": "video/mp4", "jpg": "image/jpeg"}
files = []
with open(os.path.join(work, "files.tsv")) as fh:
    for line in fh:
        f, kind, tier, width, quality, codec, audio = line.rstrip("\n").split("\t")
        ext = f.rsplit(".", 1)[1]
        files.append({
            "file": f,
            "kind": kind,                       # video | poster
            "tier": tier,                       # small | medium | large (poster: bredde)
            "maxWidth": int(width),             # c_limit: aldrig bredere, aldrig opskaleret
            "quality": quality,                 # good (video) | eco/good (poster)
            "codec": codec,                     # h264 | hevc | vp9 | jpeg
            "audio": audio == "true",
            "mime": mimes[ext],
            "bytes": os.path.getsize(os.path.join(out, f)),
        })
probe = {}
try:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height:format=duration",
                        "-of", "json", src_path], capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    s = (j.get("streams") or [{}])[0]
    probe = {"width": s.get("width"), "height": s.get("height"),
             "duration": float(j["format"]["duration"]) if j.get("format", {}).get("duration") else None}
except Exception:
    pass
manifest = {
    "generator": "flai-video-versions",
    "formatVersion": int(gen_version),
    "publicId": slug,
    "source": {"name": src_name, **probe},
    "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "files": files,
}
with open(os.path.join(out, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
FLAI_PY_EOF
  if (( $? != 0 )); then
    log "FEJL manifest"; notify "$base" "Kunne ikke skrive manifest"; rm -rf "$work"; return 1
  fi

  local partial="$dir/.${slug}.partial.zip"
  rm -f "$partial"
  if ! ( cd "$work" && zip -0 -r -X -q "$partial" "$slug" ); then
    log "FEJL zip"; notify "$base" "Kunne ikke lave zip"; rm -rf "$work" "$partial"; return 1
  fi
  mv -f "$partial" "$zip"
  rm -rf "$work"

  local secs=$(( SECONDS - started ))
  local size; size=$(du -h "$zip" | cut -f1 | tr -d ' ')
  log "FÆRDIG $zip ($size, ${secs}s)"
  notify "$base" "Færdig: $slug.flai-versions.zip ($size, $(( secs / 60 )) min)"
  /usr/bin/open -R "$zip" >/dev/null 2>&1
  return 0
}

if (( $# == 0 )); then
  print "Brug: flai-video-versions.sh <video> [<video> ...]" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  notify "ffmpeg mangler" "Installer med: brew install ffmpeg"
  print "ffmpeg/ffprobe mangler. Installer med: brew install ffmpeg" >&2
  exit 1
fi

rc=0
for f in "$@"; do
  [[ -f $f ]] || { log "SKIP $f (ikke en fil)"; continue }
  process "$f" || rc=1
done
exit $rc
