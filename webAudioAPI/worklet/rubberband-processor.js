// webAudioAPI/worklet/rubberband-processor.js
// 注意: ここは "export" などは書かない（registerProcessor だけ）

// === TEST MODE SWITCH ===
// 検証用バイパスモード。false の場合は Rubber Band WASM を使わず、入力をそのまま出力へ流します。
// 元の実装は残してあり、ENABLE_RUBBERBAND を true にすると元の処理に戻せます。
const ENABLE_RUBBERBAND = true;

const DBL_PI = Math.PI * 2;
// --- Diagnostics: safe logger helpers ---
const __TAG = '[RBW]';
// Top-level eval marker (shows that the worklet script itself loaded)
try { console.log(__TAG, 'script-evaluated'); } catch (_) {}
function __safeConsoleLog(...args) {
  try { console.log(__TAG, ...args); } catch (_) {}
}

// 心拍用（過負荷やフリーズ検知のために一定間隔でメッセージを送る）
let __hb = 0;

class RingBuffer {
  constructor(length) {
    this._buf = new Float32Array(length);
    this._r = 0; this._w = 0; this._len = length; this._filled = 0;
  }
  write(src) {
    const n = src.length;
    if (n > this._len - this._filled) return 0;
    let i = 0;
    while (i < n) {
      const spaceToEnd = this._len - this._w;
      const copy = Math.min(spaceToEnd, n - i);
      this._buf.set(src.subarray(i, i + copy), this._w);
      this._w = (this._w + copy) % this._len;
      i += copy; this._filled += copy;
    }
    return n;
  }
  read(dst) {
    const n = dst.length;
    if (n > this._filled) return 0;
    let i = 0;
    while (i < n) {
      const availToEnd = this._len - this._r;
      const copy = Math.min(availToEnd, n - i);
      dst.set(this._buf.subarray(this._r, this._r + copy), i);
      this._r = (this._r + copy) % this._len;
      i += copy; this._filled -= copy;
    }
    return n;
  }
  get filled() { return this._filled; }
}

class RubberBandNode extends AudioWorkletProcessor {
  // --- diagnostics counters & logger ---
  _logCount = 0;
  _hbCount = 0;
  _firstProcessLogged = false;

  _post(type, payload = {}) {
    try { this.port.postMessage({ type, ...payload }); } catch (_) {}
  }
  _log(msg, extra = null) {
    // Avoid flooding: only first 50 logs go out
    if (this._logCount++ < 50) {
      this._post('log', { msg, extra });
    }
    __safeConsoleLog(msg, extra);
  }

  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' },
      { name: 'pitch', defaultValue: 0.0, minValue: -24.0, maxValue: 24.0, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 1.0, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super(options);

    this._log('constructor-enter', { options: {
      outputChannelCount: options.outputChannelCount,
      processorOptions: options.processorOptions
    }});

    // 検証用フラグ（true で WASM を使わずバイパス）
    this.bypass = !ENABLE_RUBBERBAND;

    // === 設定 ===
    this.channels = Math.max(1, (options.outputChannelCount?.[0] ?? 2));
    this.sampleRate = sampleRate;

    this._log('constructor-config', { channels: this.channels, sampleRate: this.sampleRate, bypass: !ENABLE_RUBBERBAND });

    const proc = options.processorOptions || {};
    this.assetBase = proc.assetBase || ''; // rubberband.js/wasm の相対パス

    // I/O バッファ
    const RB = 8192 * 4; // worklet 内リングバッファのサイズ（十分大きめ）
    this.inRing = Array.from({ length: this.channels }, () => new RingBuffer(RB));
    this.outRing = Array.from({ length: this.channels }, () => new RingBuffer(RB));

    // RubberBand 実体（後で初期化）
    this.rbReady = false;
    this.rb = null;

    this._log('constructor-exit-booting');
    // 立ち上げ開始
    this._boot();

    this.port.onmessage = (ev) => {
      const data = ev?.data;
      if (data && data.type === 'ping') {
        this._post('pong', { t: Date.now ? Date.now() : 0 });
      }
    };
  }

  async _boot() {
    this._log('boot-start', { bypass: this.bypass });

    // 検証用：バイパス時は即 ready を返して初期化をスキップ
    if (this.bypass) {
      this._log('boot-bypass-ready');
      this._post('ready', { bypass: true });
      return;
    }

    try {
      this._log('boot-loading-module');
      // rubberband.js を require でロード（CommonJS/UMD エクスポート想定）
      const mod = require('./rubberband.js');
      // Emscripten Module 初期化（locateFile で wasm の場所を明示）
      const Module = await mod({
        locateFile: (path) => {
          if (path.endsWith('.wasm')) {
            return new URL('./rubberband.wasm', import.meta.url).toString();
          }
          return path;
        }
      });
      this._log('boot-module-loaded');

      // Rubber Band のストレッチャを作る（API 名はビルドにより差があります）
      // ここでは一般的な C++ バインディングの形を仮定
      //   new Module.RubberBandStretcher(sr, ch, options, timeRatio, pitchScale)
      const sr = this.sampleRate;
      const ch = this.channels;
      const opts =
        Module.OptionProcessOffline |
        Module.OptionThreadingAuto |
        Module.OptionFormantPreserved |  // フォルマント維持
        Module.OptionPhaseLaminar;       // 高品質位相
      const timeRatio = 1.0;             // 初期 速度比
      const pitchScale = 1.0;            // 初期 ピッチ比

      this.rb = new Module.RubberBandStretcher(sr, ch, opts, timeRatio, pitchScale);
      this._log('boot-stretcher-created', { options: 'offline|threadingAuto|formantPreserved|phaseLaminar' });

      // ある程度のブロック単位で処理するためのワークバッファ
      this.tmpIn = Array.from({ length: ch }, () => new Float32Array(2048));
      this.tmpOut = Array.from({ length: ch }, () => new Float32Array(4096)); // 出力は多め

      this.Module = Module;
      this._log('boot-ready');
      this.rbReady = true;
      this._post('ready', { bypass: false });
    } catch (e) {
      this._log('boot-error', String(e));
      this._post('error', { error: String(e) });
    }
  }

  _updateParams(rate, pitchSemis) {
    if (!this._firstProcessLogged) this._log('update-params-initial', { rate, pitchSemis });
    if (!this.rbReady) return;
    const pitchScale = Math.pow(2, pitchSemis / 12);
    const timeRatio = rate; // RubberBand は timeRatio=再生速度比（>1 で速くなる）系が一般的
    this.rb.setTimeRatio(timeRatio);
    this.rb.setPitchScale(pitchScale);
  }

  _consumeAndProcess() {
    if (!this.rbReady) { return; }

    // 1 call あたりの最大処理ブロック数（無限ループ/過負荷防止）
    const maxBlockPerCall = 8;
    let blocks = 0;

    // 入力が溜まっていたら 2048 サンプルずつ処理
    while (this.inRing[0].filled >= this.tmpIn[0].length && blocks < maxBlockPerCall) {
      // 入力読み出し
      for (let ch = 0; ch < this.channels; ch++) {
        this.inRing[ch].read(this.tmpIn[ch]);
      }

      // RubberBand に投入
      this.rb.process(this.tmpIn, this.tmpIn[0].length, false);

      // RubberBand から取り出し → outRing へ
      // outRing が一杯の場合は “今ティックはここまで” として抜ける
      let safety = 16; // 取り出しループの最大反復数（保険）
      for (;;) {
        if (--safety < 0) break;

        const nAvail = this.rb.available();
        if (nAvail <= 0) break;

        const n = Math.min(nAvail, this.tmpOut[0].length);
        const got = this.rb.retrieve(this.tmpOut, n);
        if (got <= 0) break;

        let wroteAll = true;
        for (let ch = 0; ch < this.channels; ch++) {
          const chunk = this.tmpOut[ch].subarray(0, got);
          if (this.outRing[ch].write(chunk) === 0) {
            wroteAll = false;
            break;
          }
        }
        if (!wroteAll) {
          // 出力リングが満杯。次ティックで再開する
          break;
        }
      }

    blocks++;

    }

    // light heartbeat on processing
    if ((++this._hbCount & 0xFF) === 0) {
      this._post('hb-process', {
        inFilled: this.inRing[0]?.filled ?? 0,
        outFilled: this.outRing[0]?.filled ?? 0
      });
    }

    // 心拍：およそ 512 回に 1 回、リングの充填状況を通知
    if ((++__hb & 0x1FF) === 0) {
      try {
        this.port.postMessage({
          type: 'hb',
          inFilled: this.inRing[0]?.filled ?? 0,
          outFilled: this.outRing[0]?.filled ?? 0
        });
      } catch (_) {
        // port 閉鎖時などは無視
      }
    }
  }

  process(inputs, outputs, parameters) {
    try {
      if (!this._firstProcessLogged) {
        this._firstProcessLogged = true;
        this._log('process-first', {
          inputsLen: inputs[0]?.length ?? 0,
          outputsLen: outputs[0]?.length ?? 0,
          blockSize: outputs[0]?.[0]?.length ?? 0
        });
      }

      const input = inputs[0];
      const output = outputs[0];

      // バイパス（検証用）：入力をそのまま出力へコピー
      if (this.bypass) {
        const nCh = output.length;
        for (let ch = 0; ch < nCh; ch++) {
          const src = (input[ch] ?? new Float32Array(output[ch].length));
          output[ch].set(src.subarray(0, output[ch].length));
        }
        if ((++this._hbCount & 0x1FF) === 0) {
          this._post('hb-bypass', {
            ch: output.length,
            n: output[0]?.length ?? 0
          });
        }
        return true;
      }

      if (!this.rbReady) {
        // RB 未準備：無音
        for (let ch = 0; ch < output.length; ch++) {
          output[ch].fill(0);
        }
        if ((++this._hbCount & 0x1FF) === 0) {
          this._post('hb-waiting', {});
        }
        return true;
      }

      const rate = parameters['rate'].length ? parameters['rate'][0] : 1.0;
      const pitch = parameters['pitch'].length ? parameters['pitch'][0] : 0.0;
      const wet = parameters['wet'].length ? parameters['wet'][0] : 1.0;

      if (this._logCount < 10) {
        this._log('process-params', { rate, pitch, wet });
      }

      this._updateParams(rate, pitch);

      const n = output[0].length;

      // 入力をリングバッファへ
      const chIn = input.length;
      for (let ch = 0; ch < this.channels; ch++) {
        const src = ch < chIn ? input[ch] : null;
        if (src) {
          this.inRing[ch].write(src);
        } else {
          // チャンネルが足りない場合は無音で埋める
          this.inRing[ch].write(new Float32Array(n));
        }
      }

      // 処理を進める
      this._consumeAndProcess();

      // 出力を outRing から取り出す（足りないときは原音とミックス or 無音）
      for (let ch = 0; ch < this.channels; ch++) {
        const dst = output[ch];
        const got = this.outRing[ch].read(dst) || 0;

        if (wet < 1.0) {
          const src = (ch < input.length) ? input[ch] : null;
          if (src) {
            for (let i = 0; i < n; i++) {
              const wetSamp = (i < got) ? dst[i] : 0;
              const drySamp = src[i] || 0;
              dst[i] = wet * wetSamp + (1 - wet) * drySamp;
            }
          } else {
            for (let i = got; i < n; i++) dst[i] = 0;
          }
        } else {
          for (let i = got; i < n; i++) dst[i] = 0;
        }
      }

      if ((this._hbCount++ & 0x3FF) === 0) {
        const ch0 = outputs?.[0]?.[0];
        let rms = 0;
        if (ch0) {
          for (let i = 0; i < ch0.length; i++) rms += ch0[i] * ch0[i];
          rms = Math.sqrt(rms / ch0.length);
        }
        this._post('hb-level', { rms });
      }

      return true;
    } catch (err) {
      this._log('process-exception', String(err));
      this._post('error', { error: String(err) });
      // 例外発生時でもグラフを保つため true を返す
      return true;
    }
  }
}

registerProcessor('rubberband-processor', RubberBandNode);
