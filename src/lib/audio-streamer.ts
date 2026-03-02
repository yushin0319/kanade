/**
 * 音声再生クラス
 * PCM16 データをバッファリングして Web Audio API で再生
 * Original: google-gemini/live-api-web-console (Apache 2.0)
 */

import { registeredWorklets, createWorkletFromSrc } from "./audioworklet-registry";
import { pcm16ToFloat32 } from "./audio-utils";

export class AudioStreamer {
  private bufferSize = 7680;
  private audioQueue: Float32Array[] = [];
  private isPlaying = false;
  private isStreamComplete = false;
  private checkInterval: number | null = null;
  private scheduledTime = 0;
  private initialBufferTime = 0.1;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;

  public context: AudioContext;
  public gainNode: GainNode;
  public onComplete: () => void = () => {};
  private sampleRate: number;

  constructor(context: AudioContext, sampleRate = 24000) {
    this.context = context;
    this.sampleRate = sampleRate;
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  /** ワークレットを追加（音量メーター等） */
  async addWorklet<T extends (d: MessageEvent) => void>(
    workletName: string,
    workletSrc: string,
    handler: T,
  ): Promise<this> {
    let record = registeredWorklets.get(this.context);
    if (record?.[workletName]) {
      record[workletName].handlers.push(handler);
      return this;
    }

    if (!record) {
      registeredWorklets.set(this.context, {});
      record = registeredWorklets.get(this.context)!;
    }

    record[workletName] = { handlers: [handler] };
    const src = createWorkletFromSrc(workletName, workletSrc);
    await this.context.audioWorklet.addModule(src);
    const worklet = new AudioWorkletNode(this.context, workletName);
    record[workletName].node = worklet;

    return this;
  }

  /** PCM16 バイト列を追加して再生キューに入れる */
  addPCM16(chunk: Uint8Array): void {
    this.isStreamComplete = false;
    let processingBuffer = pcm16ToFloat32(chunk);

    while (processingBuffer.length >= this.bufferSize) {
      this.audioQueue.push(processingBuffer.slice(0, this.bufferSize));
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      this.scheduleNextBuffer();
    }
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private scheduleNextBuffer(): void {
    const SCHEDULE_AHEAD_TIME = 0.2;

    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift()!;
      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null;
        }
        this.endOfQueueAudioSource = source;
        source.onended = () => {
          if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
            this.endOfQueueAudioSource = null;
            this.onComplete();
          }
        };
      }

      source.buffer = audioBuffer;
      // TODO: playbackRate > 1.0 は音割れの原因になるため一旦デフォルトに戻す
      // source.playbackRate.value = 1.2;
      source.connect(this.gainNode);

      // 登録済みワークレットへ接続
      const worklets = registeredWorklets.get(this.context);
      if (worklets) {
        Object.values(worklets).forEach(({ node, handlers }) => {
          if (node) {
            source.connect(node);
            node.port.onmessage = (ev: MessageEvent) => {
              handlers.forEach((handler) => handler.call(node.port, ev));
            };
            node.connect(this.context.destination);
          }
        });
      }

      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false;
      } else {
        this.checkInterval = window.setTimeout(() => {
          this.checkInterval = null;
          this.scheduleNextBuffer();
        }, 100) as unknown as number;
      }
    } else {
      const nextCheckTime = (this.scheduledTime - this.context.currentTime) * 1000;
      this.checkInterval = window.setTimeout(() => {
        this.checkInterval = null;
        this.scheduleNextBuffer();
      }, Math.max(0, nextCheckTime - 50)) as unknown as number;
    }
  }

  /** 再生を停止してキューをクリア */
  stop(): void {
    this.isPlaying = false;
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;

    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }

    this.gainNode.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.1);

    setTimeout(() => {
      this.gainNode.disconnect();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
    }, 200);
  }

  /** 再生を再開 */
  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  /** ストリーム完了を通知 */
  complete(): void {
    this.isStreamComplete = true;
    this.onComplete();
  }
}
