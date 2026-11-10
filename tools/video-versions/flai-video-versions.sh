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
# Sættet dækker alle enheder og browsere, som f_auto ville have gjort:
#
#   3 størrelser  (heroVideoTier i cloudinaryUrls.ts):  720 · 1280 · 1920 bred
#   × 3 formater  (det f_auto vælger ud fra browseren):
#        vp9   .webm   Chrome og andre Chromium-browsere
#        hevc  .mp4    Safari (macOS og iOS)
#        h264  .mp4    alle andre browsere (fallback)
#   = 9 videoer (alle med lyd)  +  2 posters  +  manifest.json
#
#   video_<bredde>_<codec>.<ext>     fx video_1280_hevc.mp4
#   poster_960.jpg                   960 bred, eco
#   poster_1920.jpg                  1920 bred, good
#
# Resultat: <navn>.flai-versions.zip ved siden af originalen, med mappen <navn>/ indeni.
#
# Miljøvariabler:
#   FLAI_CODECS="h264"            kun nogle formater (standard: h264 hevc vp9)
#   FLAI_FAST=1                   hurtige/grove encoder-indstillinger (kun til test)
#   FLAI_DRY=1                    vis kun planen, lav ingenting
#   FLAI_CROP=9:16                beskær til lodret (eller andet format B:H) FØR alle versioner laves.
#                                 Sættet får id <navn>-vertikal--fs og bruges som cloudinaryVideoUrlMobile.
#                                 Bredderne er stadig 720/1280/1920 (lodret: 720x1280 osv.).
#   FLAI_CROP_X=0.5               fokuspunkt vandret i beskæringen, 0 (venstre) .. 1 (højre), standard 0.5
#   FLAI_CROP_Y=0.5               fokuspunkt lodret (kun relevant hvis kilden er højere end formatet)
#
# Farver: kilden undersøges med ffprobe, og alle versioner ender som SDR · 8 bit ·
# yuv420p · limited range · BT.709, med transfer eksplicit tagget (se "Farver" nedenfor).
# Det der afviger fra det mål omregnes automatisk (HDR, BT.601, full range, P3/BT.2020,
# 10/12 bit, alpha, RGB). Hvad der er gjort står i log og i manifest.json under "color".
#
# NB: Ændrer du tiers/kvalitet i cloudinaryUrls.ts, så ret TIER_W her også.

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

GENERATOR_VERSION=4
LOG="$HOME/Library/Logs/FlaiVideoVersions.log"
mkdir -p "$HOME/Library/Logs"

typeset -A TIER_W
TIER_W=(small 720 medium 1280 large 1920)
TIERS=(small medium large)
POSTERS=(960:eco:5 1920:good:3)          # bredde:kvalitet:jpeg-q (lavere q = bedre)
CODECS=(${=FLAI_CODECS:-h264 hevc vp9})

# Beskæring (FLAI_CROP=B:H). CROP_VF sættes foran alle video- og poster-filtre.
CROP_VF=""
if [[ -n ${FLAI_CROP:-} ]]; then
  [[ $FLAI_CROP == <->:<-> ]] || { print "Ugyldig FLAI_CROP: $FLAI_CROP (brug fx 9:16)" >&2; exit 1 }
  local cx=${FLAI_CROP_X:-0.5} cy=${FLAI_CROP_Y:-0.5}
  [[ $cx == (0|1|0.<->|1.0) && $cy == (0|1|0.<->|1.0) ]] || { print "FLAI_CROP_X/Y skal være mellem 0 og 1" >&2; exit 1 }
  local cw=${FLAI_CROP%%:*} ch=${FLAI_CROP##*:}
  (( cw > 0 && ch > 0 )) || { print "Ugyldig FLAI_CROP: $FLAI_CROP" >&2; exit 1 }
  # Størst mulige udsnit i formatet cw:ch, lige dimensioner, placeret efter fokuspunktet.
  CROP_VF="crop=w='trunc(min(iw,ih*$cw/$ch)/2)*2':h='trunc(min(ih,iw*$ch/$cw)/2)*2':x='(iw-ow)*$cx':y='(ih-oh)*$cy'"
fi

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

# ─── Farver ───────────────────────────────────────────────────────────────────
# Mål for ALLE versioner: SDR · 8 bit · yuv420p · limited range · BT.709 matrix/primærfarver.
#
# Hvorfor transfer-taggen sættes eksplicit: ffmpeg kopierer ellers kildens (ofte manglende)
# tag. Er transfer "ukendt", viser Safari/QuickTime videoen lysere end Chrome/Firefox.
# Målt på Safari 27, Chrome 157 og Firefox 151: med transfer = sRGB (iec61966-2-1) ser
# videoen ens ud i alle tre, og Chrome/Firefox ændrer sig ikke. Taggen ændrer ingen pixels.
# (Et eksplicit BT.709-tag gør INGEN forskel i Safari, så det bruges ikke.)
#
# Kun det der afviger fra målet omregnes:
#   HDR (PQ/HLG)           → tonemappes til SDR via 3D-LUT (ffmpeg har ikke zscale/libplacebo)
#   BT.601 / ukendt matrix → BT.709 (ukendt: 709 fra 720 høj og op, ellers 601, som afspillere gør)
#   full range             → limited
#   BT.2020-SDR / P3       → primærfarver omregnes til BT.709
#   RGB-kilde              → YUV med BT.709-matrix (ffmpeg bruger ellers 601)
#   10/12 bit, 4:4:4, alpha → 8 bit 4:2:0
C_DESC="" C_CONV="" C_TRC="iec61966-2-1" C_TONEMAP=0 C_WARN="" C_NOTES=""

# make_hdr_lut <pq|hlg> <fil.cube>  — HDR (BT.2020) → SDR (BT.709, sRGB-kodet), 65³ punkter.
make_hdr_lut() {
  python3 - "$1" "$2" <<'FLAI_LUT_EOF'
import sys, math
kind, path = sys.argv[1], sys.argv[2]
N = 65
REF, PEAK, KNEE = 203.0, 1000.0, 0.75   # SDR-hvid = 203 nit (BT.2408); antaget mastering-peak 1000 nit
def pq_eotf(e):
    m1=2610/16384; m2=2523/4096*128; c1=3424/4096; c2=2413/4096*32; c3=2392/4096*32
    ep=e**(1/m2); num=max(ep-c1,0.0); den=c2-c3*ep
    return 10000.0*(num/den)**(1/m1) if den>0 else 10000.0
def hlg_inv_oetf(e):
    a=0.17883277; b=1-4*a; c=0.5-a*math.log(4*a)
    return (e*e)/3.0 if e<=0.5 else (math.exp((e-c)/a)+b)/12.0
def srgb_oetf(l):
    l=min(max(l,0.0),1.0)
    return 12.92*l if l<=0.0031308 else 1.055*l**(1/2.4)-0.055
M=((1.6605,-0.5876,-0.0728),(-0.1246,1.1329,-0.0083),(-0.0182,-0.1006,1.1187))  # BT.2020 → BT.709 (lineær)
def shoulder(y):
    return y if y<=KNEE else KNEE+(1-KNEE)*(1-math.exp(-(y-KNEE)/(1-KNEE)))
def convert(r,g,b):
    if kind=='pq':
        lin=[pq_eotf(c)/REF for c in (r,g,b)]
    else:
        sc=[hlg_inv_oetf(c) for c in (r,g,b)]
        ys=0.2627*sc[0]+0.6780*sc[1]+0.0593*sc[2]
        k=(PEAK/REF)*(ys**0.2 if ys>0 else 0.0)      # HLG system gamma 1.2
        lin=[c*k for c in sc]
    o=[max(sum(M[i][j]*lin[j] for j in range(3)),0.0) for i in range(3)]
    y=0.2126*o[0]+0.7152*o[1]+0.0722*o[2]
    f=shoulder(y)/y if y>1e-9 else 1.0
    o=[c*f for c in o]
    m=max(o)
    if m>1.0: o=[c/m for c in o]
    return [srgb_oetf(c) for c in o]
with open(path,'w') as fh:
    fh.write('TITLE "flai-hdr-%s"\nLUT_3D_SIZE %d\n'%(kind,N))
    for bi in range(N):
        for gi in range(N):
            for ri in range(N):
                fh.write('%.6f %.6f %.6f\n'%tuple(convert(ri/(N-1),gi/(N-1),bi/(N-1))))
FLAI_LUT_EOF
}

# color_plan <src> [<arbejdsmappe>]  — sætter C_DESC, C_CONV, C_TRC, C_TONEMAP, C_WARN, C_NOTES
color_plan() {
  local src=$1 work=${2:-} k v pix rng spc trc prim h dv M
  local -A P
  local -a chain=() notes=()
  C_DESC="" C_CONV="" C_TRC="iec61966-2-1" C_TONEMAP=0 C_WARN="" C_NOTES=""
  while IFS='=' read -r k v; do
    [[ -n $k ]] && P[$k]=$v
  done < <(ffprobe -v error -select_streams v:0 \
      -show_entries stream=pix_fmt,color_range,color_space,color_transfer,color_primaries,height \
      -of default=nw=1 "$src" 2>/dev/null)
  pix=${P[pix_fmt]:-yuv420p}; rng=${P[color_range]:-}; spc=${P[color_space]:-}
  trc=${P[color_transfer]:-}; prim=${P[color_primaries]:-}; h=${P[height]:-0}
  [[ $spc  == (unknown|unspecified|reserved) ]] && spc=""
  [[ $trc  == (unknown|unspecified|reserved) ]] && trc=""
  [[ $prim == (unknown|unspecified|reserved) ]] && prim=""
  [[ $pix == yuvj* ]] && rng=pc
  [[ $rng == (pc|jpeg|full) ]] && rng=pc || rng=tv
  C_DESC="$pix $rng ${spc:-?}/${trc:-?}/${prim:-?}"
  dv=$(ffprobe -v error -select_streams v:0 -show_streams "$src" 2>/dev/null | sed -n 's/^dv_profile=//p' | head -1)

  # ── HDR: PQ eller HLG → SDR ──
  if [[ $trc == (smpte2084|arib-std-b67) ]]; then
    local kind=pq; [[ $trc == arib-std-b67 ]] && kind=hlg
    M=bt2020; [[ $spc == bt709 ]] && M=bt709
    notes+=("HDR (${kind:u}) tonemappet til SDR")
    C_TONEMAP=1
    if [[ -n $work ]]; then
      if make_hdr_lut $kind "$work/hdr.cube"; then
        chain=("scale=in_color_matrix=${M}:in_range=${rng}:flags=accurate_rnd+full_chroma_int"
               "format=gbrp16le"
               "lut3d=file='$work/hdr.cube':interp=tetrahedral"
               "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int")
      else
        C_WARN="Kunne ikke lave HDR-tabel; farverne bliver forkerte (udvasket)"
      fi
    else
      chain=("hdr")   # kun til dry-run
    fi
    [[ $dv == 5 ]] && C_WARN="${C_WARN:+$C_WARN; }Dolby Vision profil 5 understøttes ikke; farverne bliver forkerte"
    C_CONV=${(j:,:)chain}; [[ $C_CONV == hdr ]] && C_CONV=""
    C_NOTES=${(j:; :)notes}
    return 0
  fi

  # ── SDR: matrix ──
  case $spc in
    bt709)                 M=bt709 ;;
    smpte170m|bt470bg|fcc) M=bt601 ;;
    smpte240m)             M=smpte240m ;;
    bt2020nc|bt2020c)      M=bt2020 ;;
    gbr|rgb)               M=rgb ;;
    *) if (( h >= 720 )); then M=bt709; else M=bt601; fi ;;
  esac
  [[ $pix == (gbr|rgb|bgr|argb|abgr|bgra|rgba|0rgb|rgb0|0bgr|bgr0)* ]] && M=rgb

  # transfer-tag: sRGB, medmindre kilden eksplicit er gamma 2.2/2.8/sRGB
  case $trc in
    bt470m)        C_TRC=bt470m ;;
    bt470bg)       C_TRC=bt470bg ;;
    iec61966-2-1)  C_TRC=iec61966-2-1 ;;
    *)             C_TRC=iec61966-2-1 ;;
  esac

  # transfer-kurver vi ikke kan omregne pålideligt: pixels bliver uændrede, så giv besked
  case $trc in
    linear|log100|log316|smpte428|bt1361e|iec61966-2-4|xvycc)
      C_WARN="Transfer '$trc' kan ikke omregnes; pixels er uændrede og kan se forkerte ud (log/lineær kilde?)" ;;
  esac

  if [[ $M == bt2020 || $prim == (bt2020|smpte432|smpte431) ]]; then
    # primærfarver omregnes til BT.709 (colorspace-filteret)
    local itrc=bt709 ispace=bt709 iprim=${prim:-bt2020}
    case $trc in
      bt709|smpte170m|smpte240m|bt2020-10|bt2020-12|iec61966-2-1|bt470m|bt470bg) itrc=$trc ;;
    esac
    [[ $M == bt2020 ]] && ispace=bt2020ncl
    [[ $M == bt601 ]] && ispace=smpte170m
    local otrc=$itrc; [[ $itrc == bt2020-1* ]] && otrc=bt709
    chain=("format=yuv420p10le"
           "colorspace=space=bt709:primaries=bt709:trc=${otrc}:range=tv:ispace=${ispace}:iprimaries=${iprim}:itrc=${itrc}:irange=${rng}:format=yuv420p:dither=fsb")
    notes+=("primærfarver ${iprim} → bt709")
  else
    if [[ $M == rgb ]]; then
      chain+=("scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int" "format=yuv420p")
      notes+=("RGB → YUV (BT.709)")
    else
      if [[ $rng == pc ]]; then
        chain+=("scale=in_range=pc:out_range=tv:flags=accurate_rnd+full_chroma_int")
        notes+=("full range → limited")
      fi
      if [[ $M == bt601 || $M == smpte240m ]]; then
        chain+=("format=yuv420p" "colormatrix=${M}:bt709")
        notes+=("matrix ${M} → bt709")
      fi
    fi
  fi
  [[ $dv == 5 ]] && C_WARN="Dolby Vision profil 5 understøttes ikke; farverne bliver forkerte"
  [[ $pix == *10* || $pix == *12* || $pix == *16* ]] && notes+=("${pix} → 8 bit")
  [[ $pix == *a* && $pix == yuva* ]] && notes+=("alpha fjernet")
  C_CONV=${(j:,:)chain}
  C_NOTES=${(j:; :)notes}
  return 0
}

# encode <src> <out> <width> <codec>
encode() {
  local src=$1 out=$2 w=$3 codec=$4 crf T=$C_TRC
  crf=$(crf_for "$codec")
  # c_limit: aldrig bredere end tieren, aldrig opskaleret, lige dimensioner.
  # Til sidst tvinges tags på billedet (setparams) OG i encoderen, ellers kopierer ffmpeg kildens tags.
  local vf="${CROP_VF:+$CROP_VF,}scale='trunc(min($w,iw)/2)*2':-2:flags=lanczos${C_CONV:+,$C_CONV},format=yuv420p"
  vf+=",setparams=colorspace=bt709:color_primaries=bt709:color_trc=${T}:range=tv"
  local -a venc audio
  case $codec in
    vp9)  venc=(-c:v libvpx-vp9 -crf $crf -b:v 0 -row-mt 1 $VP9_ARGS
                -colorspace bt709 -color_primaries bt709 -color_trc $T -color_range tv)
          audio=(-map '0:a:0?' -c:a libopus -b:a 96k) ;;
    hevc) venc=(-c:v libx265 -crf $crf -preset $X265_PRESET -tag:v hvc1
                -x265-params "log-level=error:colorprim=bt709:transfer=${T}:colormatrix=bt709:range=limited"
                -movflags +faststart)
          audio=(-map '0:a:0?' -c:a aac -b:a 128k) ;;
    h264) venc=(-c:v libx264 -crf $crf -preset $X264_PRESET
                -x264-params "colorprim=bt709:transfer=${T}:colormatrix=bt709:range=tv"
                -movflags +faststart)
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
  [[ -n $CROP_VF ]] && slug="${slug}-vertikal"
  zip="$dir/$slug.flai-versions.zip"

  if ! ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "$src" 2>/dev/null | grep -q video; then
    notify "$base" "Filen har intet videospor"; log "SKIP $src (intet videospor)"; return 1
  fi

  local -a plan=()
  local t c
  for t in $TIERS; do for c in $CODECS; do plan+=("$t $c"); done; done
  local total=$(( ${#plan} + ${#POSTERS} ))

  color_plan "$src" ""
  if [[ ${FLAI_DRY:-0} == 1 ]]; then
    print "Plan for $src → $zip  ($total filer + manifest)"
    [[ -n $CROP_VF ]] && print "  beskæring: $FLAI_CROP, fokus x=${FLAI_CROP_X:-0.5} y=${FLAI_CROP_Y:-0.5}  (id ${slug}--fs)"
    print "  farver: $C_DESC → SDR bt709 8-bit, transfer-tag $C_TRC${C_NOTES:+  [$C_NOTES]}${C_WARN:+  ADVARSEL: $C_WARN}"
    local item; for item in $plan; do print "  video $item  (${TIER_W[${item%% *}]} bred)"; done
    local p; for p in $POSTERS; do print "  poster ${p%%:*}"; done
    return 0
  fi

  work=$(mktemp -d "${TMPDIR:-/tmp}/flai-versions.XXXXXX") || return 1
  out="$work/$slug"; mkdir -p "$out"
  tsv="$work/files.tsv"; : > "$tsv"
  local started=$SECONDS n=0 item tier codec ext file w
  local -a parts

  color_plan "$src" "$work"
  log "START $src ($total filer)${CROP_VF:+ beskåret $FLAI_CROP x=${FLAI_CROP_X:-0.5} y=${FLAI_CROP_Y:-0.5}}"
  log "FARVE $C_DESC → SDR bt709 8-bit, tag $C_TRC${C_NOTES:+ [$C_NOTES]}${C_WARN:+ ADVARSEL: $C_WARN}"
  [[ -n $C_WARN ]] && notify "$base" "Advarsel: $C_WARN"
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
         -vf "${CROP_VF:+$CROP_VF,}scale='trunc(min($pw,iw)/2)*2':-2:flags=lanczos${C_CONV:+,$C_CONV}" -q:v $pj "$out/$file" >> "$LOG" 2>&1; then
      log "FEJL $file"; notify "$base" "Fejlede ved $file"; rm -rf "$work"; return 1
    fi
    print -- "$file\tposter\t$pw\t$pw\t$pq\tjpeg\tfalse" >> "$tsv"
  done

  python3 - "$work" "$slug" "${src:t}" "$GENERATOR_VERSION" "$src" "$C_DESC" "$C_NOTES" "$C_TONEMAP" "$C_TRC" "$C_WARN" <<'FLAI_PY_EOF'
import json, os, subprocess, sys, datetime
work, slug, src_name, gen_version, src_path = sys.argv[1:6]
c_desc, c_notes, c_tonemap, c_trc, c_warn = sys.argv[6:11]
out = os.path.join(work, slug)
mimes = {"webm": "video/webm", "mp4": "video/mp4", "jpg": "image/jpeg"}
# Hvem f_auto ville have givet formatet til, og hvad browseren selv svarer på canPlayType.
audience = {"vp9": "Chrome og andre Chromium-browsere", "hevc": "Safari (macOS og iOS)",
            "h264": "Alle andre browsere (fallback)", "jpeg": None}
can_play = {"vp9": 'video/webm; codecs="vp9"', "hevc": 'video/mp4; codecs="hvc1"',
            "h264": 'video/mp4; codecs="avc1.42E01E"', "jpeg": None}
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
            "audience": audience.get(codec),
            "canPlayType": can_play.get(codec),
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
    "color": {
        "source": c_desc,                       # pix_fmt range matrix/transfer/primaries
        "output": "sdr bt709 yuv420p tv, transfer " + c_trc,
        "adjustments": [n for n in c_notes.split("; ") if n],
        "toneMapped": c_tonemap == "1",
        "warnings": [w for w in c_warn.split("; ") if w],
    },
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
