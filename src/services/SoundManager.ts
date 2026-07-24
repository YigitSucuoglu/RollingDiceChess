import {
  SOUND_CATALOG,
  SOUND_PREFERENCE_STORAGE_KEY,
} from "../config/sounds";
import type { GameSoundId } from "../types/GameSound";

export interface AudioHandle {
  currentTime: number;
  loop: boolean;
  preload: string;
  volume: number;
  pause(): void;
  play(): Promise<void> | void;
}

export interface AudioAdapter {
  create(src: string): AudioHandle;
}

export interface SoundPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SoundManagerOptions {
  readonly audioAdapter?: AudioAdapter;
  readonly storage?: SoundPreferenceStorage | null;
}

class BrowserAudioAdapter implements AudioAdapter {
  public create(src: string): AudioHandle {
    return new Audio(src);
  }
}

function getBrowserStorage(): SoundPreferenceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class SoundManager {
  private readonly audioAdapter: AudioAdapter;

  private readonly audioCache: Map<GameSoundId, AudioHandle>;

  private enabled: boolean;

  private readonly listeners: Set<(enabled: boolean) => void>;

  private readonly storage: SoundPreferenceStorage | null;

  constructor(options: SoundManagerOptions = {}) {
    this.audioAdapter = options.audioAdapter ?? new BrowserAudioAdapter();
    this.storage =
      options.storage === undefined ? getBrowserStorage() : options.storage;
    this.audioCache = new Map();
    this.listeners = new Set();
    this.enabled = this.loadPreference();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public play(soundId: GameSoundId): void {
    if (!this.enabled) {
      return;
    }

    const audio = this.getAudio(soundId);

    audio.pause();
    audio.currentTime = 0;

    try {
      const playback = audio.play();

      if (playback instanceof Promise) {
        void playback.catch(() => undefined);
      }
    } catch {
      // Browser autoplay or media errors must never interrupt game flow.
    }
  }

  public stop(soundId: GameSoundId): void {
    const audio = this.audioCache.get(soundId);

    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }

  public stopAll(): void {
    for (const soundId of this.audioCache.keys()) {
      this.stop(soundId);
    }
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;

    if (!enabled) {
      this.stopAll();
    }

    try {
      this.storage?.setItem(
        SOUND_PREFERENCE_STORAGE_KEY,
        String(enabled)
      );
    } catch {
      // Storage availability must not affect sound controls.
    }

    for (const listener of this.listeners) {
      listener(enabled);
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);

    return this.enabled;
  }

  public subscribe(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  private getAudio(soundId: GameSoundId): AudioHandle {
    const cachedAudio = this.audioCache.get(soundId);

    if (cachedAudio) {
      return cachedAudio;
    }

    const definition = SOUND_CATALOG[soundId];
    const audio = this.audioAdapter.create(definition.src);

    audio.loop = definition.loop;
    audio.preload = "auto";
    audio.volume = definition.volume;
    this.audioCache.set(soundId, audio);

    return audio;
  }

  private loadPreference(): boolean {
    try {
      const storedValue = this.storage?.getItem(
        SOUND_PREFERENCE_STORAGE_KEY
      );

      if (storedValue === "false") {
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }
}

export default new SoundManager();
