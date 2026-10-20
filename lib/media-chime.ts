/** Keep the same media element after the user's tap: Safari grants playback per element. */
export class MediaChime {
  private pending: Promise<boolean> | null = null;
  private disposed = false;
  private generation = 0;
  constructor(private audio: HTMLAudioElement, private onResult: (played: boolean, reason?: string) => void) {
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
  }
  play(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending) return this.pending;
    if (!this.audio.paused && !this.audio.ended) return Promise.resolve(true);
    const generation = this.generation;
    let playback: Promise<void>;
    try {
      this.audio.muted = false;
      this.audio.volume = 1;
      this.audio.currentTime = 0;
      // Intentionally call play BEFORE any await so a tap retains user activation.
      playback = this.audio.play();
    } catch (error) {
      this.onResult(false, error instanceof Error ? error.name : "PlaybackError");
      return Promise.resolve(false);
    }
    this.pending = Promise.resolve(playback).then(() => {
      if (this.disposed || generation !== this.generation) return false;
      this.onResult(true);
      return true;
    }, error => {
      if (!this.disposed && generation === this.generation) this.onResult(false, error instanceof Error ? error.name : "PlaybackError");
      return false;
    }).finally(() => {if (generation === this.generation) this.pending = null;});
    return this.pending;
  }
  waitForEnd(): Promise<void> {
    if(this.disposed || this.audio.ended || this.audio.paused)return Promise.resolve();
    return new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);this.audio.removeEventListener("ended",finish);this.audio.removeEventListener("error",finish);this.audio.removeEventListener("pause",finish);resolve();};
      const timer=setTimeout(finish,4000);
      this.audio.addEventListener("ended",finish,{once:true});this.audio.addEventListener("error",finish,{once:true});this.audio.addEventListener("pause",finish,{once:true});
    });
  }
  stop() {
    this.generation += 1;
    this.pending = null;
    this.audio.pause();
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
