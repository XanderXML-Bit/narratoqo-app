# Third-party notices

Narratoqo downloads its on-device voice models and runtimes in the browser at run time. None of the model weights are stored in this repository. Each one is used under its own licence.

| Component | Source | Licence |
|---|---|---|
| Kokoro 82M (ONNX build) | [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), from [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | Apache 2.0 |
| kokoro-js | npm package `kokoro-js` | Apache 2.0 |
| Piper voices | [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) | Set per voice. Each voice's `MODEL_CARD` states its licence and training data. |
| Piper web runtime | npm package `@mintplex-labs/piper-tts-web` | MIT |
| Piper phonemizer (WebAssembly) | npm package `@diffusionstudio/piper-wasm` 1.0.0, loaded from jsDelivr at run time | MIT according to its npm metadata. It is a WebAssembly build of the Piper phonemizer, which uses espeak-ng (GPL-3.0-or-later). |
| ONNX Runtime Web | npm package `onnxruntime-web` | MIT |
| Transformers.js | npm package `@huggingface/transformers` | Apache 2.0 |

Other npm dependencies keep the licences stated in their packages. The sample text in the app is in the public domain.
