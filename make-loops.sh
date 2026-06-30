#!/usr/bin/env bash
set -euo pipefail
SRC_DIR="${1:-public/tracks}"; OUT_DIR="${2:-$SRC_DIR/loops}"
XFADE="${XFADE:-6}"; BITRATE="${BITRATE:-176k}"; LOUDNORM="${LOUDNORM:-1}"
mkdir -p "$OUT_DIR"; shopt -s nullglob nocaseglob; found=0
for f in "$SRC_DIR"/*.mp3 "$SRC_DIR"/*.wav "$SRC_DIR"/*.m4a "$SRC_DIR"/*.flac "$SRC_DIR"/*.aac "$SRC_DIR"/*.ogg; do
  [ -e "$f" ] || continue; found=1
  base="$(basename "${f%.*}")"; out="$OUT_DIR/$base.m4a"
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
  x="$(awk -v d="$dur" -v x="$XFADE" 'BEGIN{m=d*0.4; if(x>m)x=m; printf "%.3f", x}')"
  mid_end="$(awk -v d="$dur" -v x="$x" 'BEGIN{printf "%.3f", d-x}')"
  printf '-> %-40s dur=%6.1fs  xfade=%4.1fs\n' "$base" "$dur" "$x"
  filter="[0:a]asplit=3[h][m][t];[h]atrim=start=0:end=${x},asetpts=PTS-STARTPTS[head];[m]atrim=start=${x}:end=${mid_end},asetpts=PTS-STARTPTS[mid];[t]atrim=start=${mid_end},asetpts=PTS-STARTPTS[tail];[tail][head]acrossfade=d=${x}:c1=tri:c2=tri[seam];[seam][mid]concat=n=2:v=0:a=1[loop]"
  map="[loop]"
  if [ "$LOUDNORM" = "1" ]; then filter="${filter};[loop]loudnorm=I=-18:TP=-1.5:LRA=11[out]"; map="[out]"; fi
  ffmpeg -hide_banner -loglevel error -y -i "$f" -filter_complex "$filter" -map "$map" -c:a aac -b:a "$BITRATE" -movflags +faststart "$out"
done
[ "$found" = "1" ] || { echo "No audio files in: $SRC_DIR" >&2; exit 1; }
echo "Done -> $OUT_DIR"; for o in "$OUT_DIR"/*.m4a; do [ -e "$o" ]||continue; d="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$o")"; printf '   %-44s %6.1fs\n' "$(basename "$o")" "$d"; done
