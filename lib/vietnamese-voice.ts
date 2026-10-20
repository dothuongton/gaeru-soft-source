type Voice = {lang: string; voiceURI: string; localService: boolean};
export function isVietnameseVoice(voice: Pick<Voice, "lang">): boolean {
  return /^vi(?:[-_]|$)/i.test(voice.lang.trim());
}
/** Never fall back to the device default, which may read Vietnamese in another language. */
export function selectVietnameseVoice<T extends Voice>(voices: T[], preferred = ""): T | null {
  const vietnamese = voices.filter(isVietnameseVoice);
  return vietnamese.find(voice => voice.voiceURI === preferred)
    ?? vietnamese.find(voice => voice.localService)
    ?? vietnamese[0]
    ?? null;
}
