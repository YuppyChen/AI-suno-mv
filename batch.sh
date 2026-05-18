#!/usr/bin/env bash
set -euo pipefail

INPUT_DIR="/Users/roc/Documents/github-code/AI-suno-mv/素材/原曲"
OUTPUT_DIR="/Users/roc/Documents/github-code/AI-suno-mv/素材/降key变速"

# 第一个调整值：pitch（降 key 倍率），用于输出文件命名
PITCH="0.7937"
TEMPO="0.92"

FFMPEG_BIN="ffmpeg"
if [ -x "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" ]; then
  FFMPEG_BIN="/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg"
elif ! command -v ffmpeg >/dev/null 2>&1; then
  echo "未找到 ffmpeg，请先安装。"
  exit 1
fi

HAS_RUBBERBAND=0
if "$FFMPEG_BIN" -hide_banner -filters 2>/dev/null | grep -q " rubberband "; then
  HAS_RUBBERBAND=1
fi

find "$INPUT_DIR" -type f -iname "*.mp3" | while IFS= read -r file; do
  rel_path="${file#"$INPUT_DIR/"}"
  rel_dir="$(dirname "$rel_path")"
  filename="$(basename "$file")"
  name="${filename%.*}"
  ext="${filename##*.}"

  out_dir="$OUTPUT_DIR/$rel_dir"
  mkdir -p "$out_dir"
  out_file="$out_dir/${name}_p${PITCH}.${ext}"

  if [ "$HAS_RUBBERBAND" -eq 1 ]; then
    "$FFMPEG_BIN" -y -i "$file" \
      -af "rubberband=pitch=${PITCH},atempo=${TEMPO}" \
      "$out_file"
  else
    # 兼容方案：先通过 asetrate 改变音高，再用 atempo 修正到目标速度。
    # FINAL_TEMPO = PITCH * (TEMPO/PITCH) = TEMPO
    fallback_atempo="$(awk "BEGIN { printf \"%.6f\", ${TEMPO}/${PITCH} }")"
    "$FFMPEG_BIN" -y -i "$file" \
      -af "asetrate=44100*${PITCH},aresample=44100,atempo=${fallback_atempo}" \
      "$out_file"
  fi
done

echo "处理完成：$OUTPUT_DIR"
