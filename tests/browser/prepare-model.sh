#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
mkdir -p .cache/kokoro-fixture
cd .cache/kokoro-fixture

base='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve'
revision='1939ad2a8e416c0acfeecc08a694d14ef25f2231'

while read -r checksum asset; do
  if printf '%s  %s\n' "$checksum" "$asset" | shasum -a 256 -c --status; then
    continue
  fi
  mkdir -p "$(dirname "$asset")"
  curl --fail --location --silent --show-error --retry 2 --max-time 150 \
    "$base/$revision/$asset" -o "$asset.tmp"
  printf '%s  %s\n' "$checksum" "$asset.tmp" | shasum -a 256 -c
  mv "$asset.tmp" "$asset"
done <<'CHECKSUMS'
df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f config.json
77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34 tokenizer.json
be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20 tokenizer_config.json
fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478 onnx/model_quantized.onnx
d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b voices/af_heart.bin
CHECKSUMS
