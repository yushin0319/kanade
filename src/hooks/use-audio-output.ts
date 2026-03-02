import { useRef, useCallback } from "react";
import { AudioStreamer } from "../lib/audio-streamer";
import { getAudioContext } from "../lib/audio-context";
import VolMeterWorklet from "../lib/worklets/vol-meter";

export interface UseAudioOutputReturn {
  streamerRef: React.MutableRefObject<AudioStreamer | null>;
  initStreamer: () => Promise<AudioStreamer>;
  stopStreamer: () => void;
}

export function useAudioOutput(): UseAudioOutputReturn {
  const streamerRef = useRef<AudioStreamer | null>(null);

  const initStreamer = useCallback(async (): Promise<AudioStreamer> => {
    const playbackCtx = await getAudioContext({ id: "playback", sampleRate: 24000 });
    const streamer = new AudioStreamer(playbackCtx, 24000);
    await streamer.addWorklet("output-vu-meter", VolMeterWorklet, () => {});
    streamerRef.current = streamer;
    return streamer;
  }, []);

  const stopStreamer = useCallback(() => {
    streamerRef.current?.stop();
    streamerRef.current = null;
  }, []);

  return { streamerRef, initStreamer, stopStreamer };
}
