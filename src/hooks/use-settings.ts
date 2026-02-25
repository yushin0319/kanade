/**
 * アプリ設定の読み書きフック
 * tauri-plugin-store で settings.json に永続化
 */

import { useState, useCallback, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";
import type { Settings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";

export interface UseSettingsReturn {
  settings: Settings;
  loaded: boolean;
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);

  const getStore = useCallback(async () => {
    if (!storeRef.current) {
      storeRef.current = await load("settings.json");
    }
    return storeRef.current;
  }, []);

  const loadSettings = useCallback(async () => {
    const store = await getStore();
    const newSettings: Settings = { ...DEFAULT_SETTINGS };

    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const val = await store.get(key);
      if (val !== undefined && val !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newSettings as any)[key] = val;
      }
    }

    setSettings(newSettings);
    setLoaded(true);
  }, [getStore]);

  const updateSetting = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const store = await getStore();
      await store.set(key, value);
      await store.save();
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [getStore],
  );

  return { settings, loaded, loadSettings, updateSetting };
}
