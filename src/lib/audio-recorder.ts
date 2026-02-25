/**
 * マイク録音クラス
 * AudioWorklet で Float32 → Int16 変換し、Base64 で送信
 * Original: google-gemini/live-api-web-console (Apache 2.0)
 */

import { getAudioContext } from "./audio-context";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorklet from "./worklets/vol-meter";
import { createWorkletFromSrc } from "./audioworklet-registry";
import { arrayBufferToBase64 } from "./audio-utils";

export interface AudioRecorderCallbacks {
  /** PCM16 データ（Base64 エンコード済み）を受信 */
  onData: (base64: string) => void;
  /** 音量レベル（0.0〜1.0）を受信 */
  onVolume?: (volume: number) => void;
}

export class AudioRecorder {
  private stream: MediaStream | undefined;
  private audioContext: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private recordingWorklet: AudioWorkletNode | undefined;
  private vuWorklet: AudioWorkletNode | undefined;
  private starting: Promise<void> | null = null;
  private callbacks: AudioRecorderCallbacks;
  private sampleRate: number;

  recording = false;

  constructor(callbacks: AudioRecorderCallbacks, sampleRate = 16000) {
    this.callbacks = callbacks;
    this.sampleRate = sampleRate;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is not supported");
    }

    const doStart = async (): Promise<void> => {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = await getAudioContext({ sampleRate: this.sampleRate });
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      // 録音ワークレット
      const workletName = "audio-recorder-worklet";
      const src = createWorkletFromSrc(workletName, AudioRecordingWorklet);
      await this.audioContext.audioWorklet.addModule(src);
      this.recordingWorklet = new AudioWorkletNode(this.audioContext, workletName);

      this.recordingWorklet.port.onmessage = (ev: MessageEvent) => {
        const arrayBuffer = ev.data.data?.int16arrayBuffer as ArrayBuffer | undefined;
        if (arrayBuffer) {
          this.callbacks.onData(arrayBufferToBase64(arrayBuffer));
        }
      };
      this.source.connect(this.recordingWorklet);

      // VU メーターワークレット
      const vuName = "vu-meter";
      await this.audioContext.audioWorklet.addModule(
        createWorkletFromSrc(vuName, VolMeterWorklet),
      );
      this.vuWorklet = new AudioWorkletNode(this.audioContext, vuName);
      this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
        this.callbacks.onVolume?.(ev.data.volume as number);
      };
      this.source.connect(this.vuWorklet);

      this.recording = true;
      this.starting = null;
    };

    this.starting = doStart();
    return this.starting;
  }

  stop(): void {
    const handleStop = () => {
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.recording = false;
    };

    // start() が完了する前に stop() が呼ばれた場合への対応
    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }
    handleStop();
  }
}
