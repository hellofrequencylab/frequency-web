/**
 * Minimal typings for the YouTube IFrame Player API — only what the sync engine
 * uses. The full API is large; expand as needed.
 * https://developers.google.com/youtube/iframe_api_reference
 */
export {};

declare global {
  interface YTPlayer {
    loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
    cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getPlayerState(): number;
    getVideoData(): { video_id?: string };
    destroy(): void;
  }

  interface YTPlayerEvent {
    target: YTPlayer;
    data: number;
  }

  interface YTNamespace {
    Player: new (
      el: HTMLElement | string,
      opts: {
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: (e: YTPlayerEvent) => void;
          onStateChange?: (e: YTPlayerEvent) => void;
        };
      },
    ) => YTPlayer;
    PlayerState: {
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
      BUFFERING: number;
      CUED: number;
      UNSTARTED: number;
    };
  }

  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
