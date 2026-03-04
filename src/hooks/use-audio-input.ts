import { useCallback, useRef } from 'react'
import { AudioRecorder } from '../lib/audio-recorder'

export interface UseAudioInputReturn {
  recorderRef: React.MutableRefObject<AudioRecorder | null>
  startRecorder: (
    onData: (base64: string) => void,
    onVolume: (volume: number) => void,
  ) => Promise<void>
  stopRecorder: () => void
}

export function useAudioInput(): UseAudioInputReturn {
  const recorderRef = useRef<AudioRecorder | null>(null)

  const startRecorder = useCallback(
    async (
      onData: (base64: string) => void,
      onVolume: (volume: number) => void,
    ) => {
      const recorder = new AudioRecorder({ onData, onVolume }, 16000)
      await recorder.start()
      recorderRef.current = recorder
    },
    [],
  )

  const stopRecorder = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
  }, [])

  return { recorderRef, startRecorder, stopRecorder }
}
