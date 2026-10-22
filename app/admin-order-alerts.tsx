"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {ArrowUpRight, BellRing, DoorOpen, X} from "lucide-react";
import {money} from "@/lib/menu";
import type {Order, ServiceRequest} from "@/lib/menu";
import {ADMIN_ALERT_DURATION_MS, collectOrderAlerts} from "@/lib/admin-notifications";
import {adminAlertSpeech, collectOpeningAlerts, collectSupportAlerts, isSupportAlert, isOpeningAlert, pendingAdminAlerts, restrictAdminAlerts, sortAdminAlertArrivals, type AdminAlert, type AdminAlertScope, type OpeningSession} from "@/lib/admin-opening-alerts";
import {popupDurationMs} from "@/lib/display-settings";
import {resolvePopupTiming, type PopupTiming} from "@/lib/admin-popup-timing";
import {AudioAnnouncementLedger, AudioAnnouncementQueue} from "@/lib/admin-audio-policy";
import "./admin-order-alerts.css";

import {isVietnameseVoice, selectVietnameseVoice} from "@/lib/vietnamese-voice";
import {MediaChime} from "@/lib/media-chime";
type PlaybackNavigator = Navigator & {audioSession?: {type: string}};
type AudioReadiness = {ready: boolean; needsGesture: boolean};

export function useAdminOrderAlerts(popupSeconds = 3) {
  const [soundMode,setMode]=useState<"voice"|"chime"|"silent">("voice");
  const modeRef=useRef<"voice"|"chime"|"silent">("voice");
  const chimePlaying=useRef(false);
  useEffect(()=>{
    try{const saved=localStorage.getItem("gaeru:audio-mode");if(saved==="voice"||saved==="chime"||saved==="silent"){modeRef.current=saved;setMode(saved);}}catch{/* Storage can be unavailable. */}
  },[]);
  const [queue, setQueue] = useState<AdminAlert[]>([]);
  const [readiness, setReadiness] = useState<AudioReadiness>({ready: false, needsGesture: true});
  const [voiceNotice, setVoiceNotice] = useState("");
  const [voiceOptions, setVoiceOptions] = useState<Array<{id: string; name: string}>>([]);
  const [selectedVoice, setSelectedVoice] = useState("");
  const selectedVoiceRef = useRef("");
  const [voiceSummary, setVoiceSummary] = useState("Đang tải danh sách giọng đọc…");
  const [visible, setVisible] = useState(true);
  const mounted = useRef(false);
  const seen = useRef<Set<string> | null>(null);
  const seenSupport = useRef<Set<string> | null>(null);
  const lastCalls = useRef<ServiceRequest[]>([]);
  const seenOpenings = useRef<Set<string> | null>(null);
  const scope = useRef<AdminAlertScope>({orders: true, openings: true});
  const lastSessions = useRef<OpeningSession[]>([]);
  const mediaChime = useRef<MediaChime | null>(null);
  const mediaReady = useRef(false);
  const [mediaNotice, setMediaNotice] = useState("");
  const vietnameseVoice = useRef<SpeechSynthesisVoice | null>(null);
  const announcements = useRef(new AudioAnnouncementLedger());
  const audioQueue = useRef(new AudioAnnouncementQueue<AdminAlert>());
  const playingAlert = useRef<AdminAlert | null>(null);
  const audioBlocked = useRef(false);
  const nextSpeechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chimed = useRef<Set<string>>(new Set());
  const speechReady = useRef(false);
  const speechNeedsGesture = useRef(false);
  const speechEpoch = useRef(0);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const retryCurrent = useRef<() => void>(() => {});
  const active = queue[0] ?? null;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const configuredSeconds = useRef(popupSeconds);
  configuredSeconds.current = popupSeconds;
  const timing = useRef<PopupTiming | null>(null);
  const [displayTiming, setDisplayTiming] = useState<PopupTiming | null>(null);
  const durationMs = active && displayTiming?.alertId === active.id ? displayTiming.durationMs : popupDurationMs(popupSeconds);

  const reportReadiness = useCallback(() => {
    if (!mounted.current) return;
    const supported = typeof Audio !== "undefined" || ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    const hasSpeech = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    const ready = modeRef.current==="silent" || (modeRef.current==="chime"?mediaReady.current:hasSpeech ? speechReady.current : mediaReady.current);
    const next = {ready, needsGesture: supported && (!ready || speechNeedsGesture.current)};
    setReadiness(previous => previous.ready === next.ready && previous.needsGesture === next.needsGesture ? previous : next);
    if (!supported) setVoiceNotice("Trình duyệt này chưa hỗ trợ âm báo. Mở trang quản trị bằng trình duyệt có hỗ trợ âm thanh.");
  }, []);

  const stopSpeech = useCallback(() => {
    speechEpoch.current += 1;
    const current = playingAlert.current;
    if (current && announcements.current.hasStarted(current.id)) audioQueue.current.complete(current.id);
    playingAlert.current = null;
    if (nextSpeechTimer.current) clearTimeout(nextSpeechTimer.current);
    nextSpeechTimer.current = null;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = null;
    utterance.current = null;
    announcements.current.cancel();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const synth = window.speechSynthesis;
        if (synth.speaking || synth.pending) synth.cancel();
      } catch { /* A detached browser speech engine may already be stopped. */ }
    }
  }, []);

  const setSoundMode=useCallback((mode:"voice"|"chime"|"silent")=>{
    stopSpeech();mediaChime.current?.stop();audioQueue.current.reconcile([]);
    modeRef.current=mode;setMode(mode);audioBlocked.current=false;reportReadiness();
    try{localStorage.setItem("gaeru:audio-mode",mode);}catch{/* Session state remains usable. */}
  },[stopSpeech,reportReadiness]);

  const continueAudio = useCallback((delay = 180) => {
    if (nextSpeechTimer.current) clearTimeout(nextSpeechTimer.current);
    nextSpeechTimer.current = setTimeout(() => {
      nextSpeechTimer.current = null;
      if (mounted.current && visibleRef.current && !audioBlocked.current) retryCurrent.current();
    }, delay);
  }, []);

  const prepareAudio = useCallback(() => {
    if (!mounted.current) return;
    if (!mediaChime.current && typeof Audio !== "undefined") {
      mediaChime.current = new MediaChime(new Audio("/audio/notification.wav"), (played, reason) => {
        if (!mounted.current) return;
        mediaReady.current = played;
        setMediaNotice(played
          ? "Trình duyệt đã bắt đầu phát chuông. Nếu chưa nghe, kiểm tra âm lượng và đầu ra Bluetooth/AirPlay."
          : reason === "NotAllowedError"
            ? "Safari đang chặn chuông. Chạm trực tiếp nút Thử chuông để cấp quyền phát."
            : "Không phát được tệp chuông. Kiểm tra mạng, tải lại trang rồi bấm Thử chuông.");
        reportReadiness();
      });
    }
    reportReadiness();
  }, [reportReadiness]);

  const chime = useCallback((): Promise<boolean> => {
    if (modeRef.current==="silent" || !mounted.current || document.visibilityState !== "visible") return Promise.resolve(false);
    prepareAudio();
    try {
      const session = (navigator as PlaybackNavigator).audioSession;
      if (session) session.type = "playback";
    } catch { /* Older Safari versions do not expose Audio Session. */ }
    return mediaChime.current?.play() ?? Promise.resolve(false);
  }, [prepareAudio]);

  const speak = useCallback((text: string, alert?: AdminAlert, withChime = false) => {
    if (!mounted.current || !visibleRef.current || (alert && !announcements.current.canBegin(alert))) return;
    stopSpeech();
    const attempt = alert ? announcements.current.begin(alert) : null;
    playingAlert.current = alert ?? null;
    const finishAttempt = (completed = false) => {
      if (attempt) announcements.current.finish(attempt);
      playingAlert.current = null;
      if (completed && alert) audioQueue.current.complete(alert.id);
    };
    if (!withChime) {
      // A direct speech test must not inherit the media element's playback session.
      mediaChime.current?.stop();
      setMediaNotice("");
      try {const session = (navigator as PlaybackNavigator).audioSession; if (session) session.type = "auto";} catch { /* Optional API. */ }
    }
    const epoch = speechEpoch.current;
    const chimeResult = !withChime ? Promise.resolve(false) : alert && chimed.current.has(alert.id) ? Promise.resolve(true) : chime();
    void chimeResult.then(played => {
      if (played && alert && mounted.current && epoch === speechEpoch.current) chimed.current.add(alert.id);
    });
    const finishFallback = () => {
      if(!withChime){finishAttempt(false);audioBlocked.current=true;return;}
      void chime().then(delivered => {
        if (!mounted.current || epoch !== speechEpoch.current) return;
        finishAttempt(false);
        // A chime is not a completed Vietnamese announcement. Keep it for retry.
        audioBlocked.current = true;
      });
    };
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      finishFallback();
      setVoiceNotice("Trình duyệt chưa hỗ trợ đọc giọng nói. Bạn có thể chọn chế độ Âm báo.");
      return;
    }
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    vietnameseVoice.current = selectVietnameseVoice(voices, selectedVoiceRef.current);
    if (!vietnameseVoice.current && voices.length > 0) {
      speechReady.current = false;
      speechNeedsGesture.current = false;
      finishFallback();
      setVoiceNotice("Thiết bị chưa có giọng tiếng Việt. Hãy cài giọng tiếng Việt trong Trợ năng của iPhone hoặc chọn Âm báo.");
      reportReadiness();
      return;
    }
    try {
      const line = new SpeechSynthesisUtterance(text.normalize("NFC"));
      utterance.current = line;
      line.lang = "vi-VN";
      line.rate = 1;
      line.pitch = 1;
      line.volume = 1;
      if (vietnameseVoice.current) line.voice = vietnameseVoice.current;
      setVoiceNotice("Đang khởi động giọng đọc: " + (vietnameseVoice.current?.name ?? "Tiếng Việt tự động") + ".");
      line.onstart = () => {
        if (!mounted.current || epoch !== speechEpoch.current || (attempt && !announcements.current.markStarted(attempt))) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        // A browser that loses onend must not hold every later table indefinitely.
        speechTimer.current = setTimeout(() => {
          if (!mounted.current || epoch !== speechEpoch.current) return;
          stopSpeech();
          setVoiceNotice("Giọng đọc bị gián đoạn. Bấm Thử giọng đọc để kiểm tra.");
          continueAudio();
        }, Math.max(30_000, text.length * 160));
        audioBlocked.current = false;
        speechReady.current = true;
        speechNeedsGesture.current = false;
        setVoiceNotice("Đang đọc tiếng Việt bằng giọng " + (line.voice?.name ?? "tự động") + ".");
        reportReadiness();
      };
      line.onend = () => {
        if (!mounted.current || epoch !== speechEpoch.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        speechTimer.current = null;
        utterance.current = null;
        if (typeof window !== "undefined") {
          (window as unknown as { __activeUtterance?: SpeechSynthesisUtterance | null }).__activeUtterance = null;
        }
        if (!alert) setVoiceNotice("Đã đọc xong câu thông báo thử nghiệm.");
        finishAttempt(true);
        audioBlocked.current = false;
        continueAudio();
      };
      line.onerror = event => {
        if (!mounted.current || epoch !== speechEpoch.current) return;
        if (speechTimer.current) clearTimeout(speechTimer.current);
        speechTimer.current = null;
        utterance.current = null;
        if (typeof window !== "undefined") {
          (window as unknown as { __activeUtterance?: SpeechSynthesisUtterance | null }).__activeUtterance = null;
        }
        const started = !!alert && announcements.current.hasStarted(alert.id);
        finishAttempt(started);
        audioBlocked.current = !started;
        if (started) continueAudio();
        if (event.error === "canceled" || event.error === "interrupted") {
          if (!started) {speechReady.current = false; speechNeedsGesture.current = true; reportReadiness();}
          return;
        }
        speechReady.current = false;
        speechNeedsGesture.current = event.error === "not-allowed";
        setVoiceNotice("Không phát được giọng đọc (" + event.error + "). Kiểm tra giọng tiếng Việt trên thiết bị hoặc chọn Âm báo.");
        if(withChime)void chime();
        reportReadiness();
      };
      const startSpeech = () => {
        if (!mounted.current || epoch !== speechEpoch.current || !visibleRef.current) return;
        mediaChime.current?.stop();
        speechTimer.current = setTimeout(() => {
          if (!mounted.current || epoch !== speechEpoch.current) return;
          stopSpeech();
          audioBlocked.current = true;
          speechReady.current = false;
          speechNeedsGesture.current = true;
          setVoiceNotice("Trình duyệt chưa khởi động giọng đọc sau 8 giây.");
          reportReadiness();
        }, 8_000);
        try {
          if (synth.paused) synth.resume();
          if (typeof window !== "undefined") {
            (window as unknown as { __activeUtterance?: SpeechSynthesisUtterance | null }).__activeUtterance = line;
          }
          synth.speak(line);
        } catch {
          if(speechTimer.current)clearTimeout(speechTimer.current);
          speechTimer.current=null;
          finishAttempt(false);
          utterance.current=null;
          audioBlocked.current=true;
          speechReady.current=false;
          speechNeedsGesture.current=true;
          setVoiceNotice("Chưa đọc được thông báo. Chạm nút phát thông báo để kích hoạt lại.");
          if(withChime)void chime();
          reportReadiness();
        }
      };
      // The direct activation stays synchronous; later notifications wait for the chime.
      if(!withChime)startSpeech();
      else void chimeResult.then(async played=>{if(played)await mediaChime.current?.waitForEnd();startSpeech();});
    } catch {
      stopSpeech();
      audioBlocked.current = true;
      speechReady.current = false;
      speechNeedsGesture.current = true;
      setVoiceNotice("Chưa phát được giọng đọc. Bấm Thử giọng đọc để kiểm tra.");
      if(withChime)void chime();
      reportReadiness();
    }
  }, [chime, continueAudio, reportReadiness, stopSpeech]);

  const announceCurrent = useCallback((retry = false) => {
    if(modeRef.current==="silent"){audioQueue.current.reconcile([]);return;}
    if(modeRef.current==="chime"){
      const current=audioQueue.current.first();
      if(!current||chimePlaying.current||!mounted.current||!visibleRef.current)return;
      chimePlaying.current=true;
      void chime().then(played=>{
        if(played){audioQueue.current.complete(current.id);continueAudio();}
      }).finally(()=>{chimePlaying.current=false;});
      return;
    }
    if (!mounted.current || !visibleRef.current || utterance.current || (audioBlocked.current && !retry)) return;
    if (retry) audioBlocked.current = false;
    const current = audioQueue.current.first();
    if (current) speak(adminAlertSpeech(current), current);
  }, [speak,chime,continueAudio]);
  retryCurrent.current = () => announceCurrent(true);

  const activateSound = useCallback(() => {
    if(modeRef.current==="silent")return;
    prepareAudio();
    if(modeRef.current==="chime"){void chime();return;}
    // Let an audible table announcement finish; it already confirms playback.
    if (playingAlert.current && announcements.current.hasStarted(playingAlert.current.id)) {
      return;
    }
    // Keep speak in the click handler; it owns cancellation, avoiding two cancels.
    audioBlocked.current = false;
    const current = audioQueue.current.first();
    if (current && announcements.current.canBegin(current)) {
      speak(adminAlertSpeech(current), current, false);
    } else {
      speak("Đây là giọng đọc thông báo. Bàn số một cần hỗ trợ.", undefined, false);
    }
  }, [prepareAudio, speak, stopSpeech,chime]);

  const testSound=useCallback(()=>{
    if(modeRef.current==="silent")return;
    prepareAudio();
    if(modeRef.current==="chime"){void chime();return;}
    audioBlocked.current=false;
    speak("Đây là giọng đọc thông báo. Bàn số một cần hỗ trợ.",undefined,false);
  },[prepareAudio,chime,speak]);

  const observeDashboard = useCallback((orders: Order[], sessions: OpeningSession[], calls: ServiceRequest[] = []) => {
    const permittedOrders = scope.current.orders ? orders : [];
    const permittedSessions = scope.current.openings ? sessions : [];
    lastSessions.current = permittedSessions;
    const permittedCalls = scope.current.openings ? calls : []; lastCalls.current = permittedCalls;
    const supportDiscovery = scope.current.openings ? collectSupportAlerts(permittedCalls, seenSupport.current) : null;
    if(supportDiscovery) seenSupport.current = supportDiscovery.seenIds;
    const orderDiscovery = scope.current.orders ? collectOrderAlerts(permittedOrders, seen.current) : null;
    const openingDiscovery = scope.current.openings ? collectOpeningAlerts(permittedSessions, seenOpenings.current) : null;
    if (orderDiscovery) seen.current = orderDiscovery.seenIds;
    if (openingDiscovery) seenOpenings.current = openingDiscovery.seenIds;
    const arrivals = sortAdminAlertArrivals([...(orderDiscovery?.alerts ?? []), ...(openingDiscovery?.alerts ?? []), ...(supportDiscovery?.alerts ?? [])], permittedOrders, permittedSessions, permittedCalls);
    setQueue(previous => pendingAdminAlerts([...previous, ...arrivals], permittedOrders, permittedSessions, permittedCalls));
    const previousHeadId = audioQueue.current.first()?.id;
    const pending = pendingAdminAlerts([...audioQueue.current.snapshot(), ...arrivals], permittedOrders, permittedSessions, permittedCalls);
    audioQueue.current.reconcile(pending);
    // If speech awaits permission, new arrivals can still use an available chime.
    if (modeRef.current==="chime" && audioBlocked.current && arrivals.length) {
      void chime().then(played => {
        if (played && mounted.current) for (const alert of arrivals) chimed.current.add(alert.id);
      });
    }
    const reading = playingAlert.current;
    if (reading) {
      const updated = pending.find(alert => alert.id === reading.id);
      if (!updated || updated.tableId !== reading.tableId || updated.tableName !== reading.tableName) stopSpeech();
    }
    // A failed request that was just handled must not keep the next table blocked.
    // Retry once for a new head; unchanged polling never retries the blocked head.
    announceCurrent(previousHeadId !== audioQueue.current.first()?.id);
  }, [announceCurrent, chime, stopSpeech]);

  // A revoked permission prunes only its own event kind. Re-granting starts a silent
  // baseline, without replaying history or resetting the other kind's seen orders.
  const restrictAlerts = useCallback((canOrders: boolean, canOpenings: boolean) => {
    const previous = scope.current;
    if (previous.orders === canOrders && previous.openings === canOpenings) return;
    const next = {orders: canOrders, openings: canOpenings};
    scope.current = next;
    if (previous.orders !== canOrders) seen.current = null;
    if (previous.openings !== canOpenings) {seenOpenings.current = null; seenSupport.current = null; lastCalls.current = []; lastSessions.current = [];}
    setQueue(current => restrictAdminAlerts(current, next));
    const previousHeadId = audioQueue.current.first()?.id;
    audioQueue.current.reconcile(restrictAdminAlerts(audioQueue.current.snapshot(), next));
    const reading = playingAlert.current;
    if (reading && !((isOpeningAlert(reading) || isSupportAlert(reading)) ? canOpenings : canOrders)) stopSpeech();
    announceCurrent(previousHeadId !== audioQueue.current.first()?.id);
  }, [announceCurrent, stopSpeech]);

  const resetAlerts = useCallback(() => {
    stopSpeech();
    setQueue([]);
    audioQueue.current.reconcile([]);
    announcements.current = new AudioAnnouncementLedger();
    seen.current = null;
    seenOpenings.current = null; seenSupport.current = null; lastCalls.current = [];
    lastSessions.current = [];
    scope.current = {orders: false, openings: false};
    chimed.current.clear();
    audioBlocked.current = false;
  }, [stopSpeech]);

  const observeOrders = useCallback((orders: Order[]) => observeDashboard(orders, lastSessions.current, lastCalls.current), [observeDashboard]);

  const dismiss = useCallback(() => setQueue(previous => previous.slice(1)), []);

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      const showing = document.visibilityState === "visible";
      visibleRef.current = showing;
      setVisible(showing);
      if (!showing) stopSpeech();
      else {prepareAudio(); announceCurrent(true);}
    };
    const refreshVoices = () => {
      const voices = window.speechSynthesis.getVoices();
        const vietnamese = voices.filter(isVietnameseVoice);
      setVoiceOptions(vietnamese.map(voice => ({id: voice.voiceURI, name: voice.name + (voice.localService ? " · Trên thiết bị" : " · Trực tuyến")})));
      setVoiceSummary(vietnamese.length ? "Thiết bị cung cấp " + vietnamese.length + " giọng tiếng Việt." : "Thiết bị chưa cung cấp giọng tiếng Việt. Hãy cài giọng tiếng Việt trong cài đặt giọng nói / Trợ năng của điện thoại hoặc máy tính, rồi tải lại trang.");
      vietnameseVoice.current = selectVietnameseVoice(vietnamese, selectedVoiceRef.current);
      if(vietnameseVoice.current && audioBlocked.current && !utterance.current)announceCurrent(true);
    };
    let lastGestureAt = -Infinity;
    const onGesture = (event: Event) => {
      if (modeRef.current==="silent" || !event.isTrusted || document.visibilityState !== "visible") return;
      // The explicit sound button owns its click; do not cancel it on bubbling.
      if (event.target instanceof Element && event.target.closest("[data-audio-test]")) return;
      const now = performance.now();
      if (now - lastGestureAt < 700) return;
      lastGestureAt = now;
      const current = audioQueue.current.first();
      if (current && !announcements.current.hasStarted(current.id) && (!speechReady.current || speechNeedsGesture.current || !mediaReady.current)) {
        // A pending pre-gesture utterance may never emit an error on mobile.
        // Replace it inside this real gesture instead of waiting for its timeout.
        stopSpeech();
      }
      prepareAudio();
      // Only an outstanding alert is spoken. Opening the page does not greet aloud.
      announceCurrent(true);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    const gestures = ["touchend", "keydown", "click"];
    for (const event of gestures) document.addEventListener(event, onGesture, {passive: true});
    if ("speechSynthesis" in window) {refreshVoices(); window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);}
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      for (const event of gestures) document.removeEventListener(event, onGesture);
      if ("speechSynthesis" in window) window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      stopSpeech();
      mediaChime.current?.dispose();
      mediaChime.current = null;
      mediaReady.current = false;
    };
  }, [announceCurrent, prepareAudio, stopSpeech]);

  useEffect(() => {
    if (!active) {timing.current = null; setDisplayTiming(null); return;}
    if (!visible) return;
    const id = active.id;
    const currentTiming = resolvePopupTiming(timing.current, id, configuredSeconds.current);
    timing.current = currentTiming;
    setDisplayTiming(currentTiming);
    const timer = setTimeout(() => setQueue(previous => previous[0]?.id === id ? previous.slice(1) : previous), currentTiming.durationMs);
    return () => clearTimeout(timer);
  }, [active?.id, visible]);

  const speechNotice = voiceNotice || (readiness.needsGesture
    ? "Chạm “Phát thông báo” để kích hoạt giọng đọc tiếng Việt. Giữ trang quản trị mở; kiểm tra âm lượng đa phương tiện, chế độ im lặng và kết nối Bluetooth."
    : "");
  const audioNotice = [mediaNotice, speechNotice].filter(Boolean).join(" ");
  const chooseVoice = (id: string) => {stopSpeech(); selectedVoiceRef.current = id; setSelectedVoice(id); speechReady.current = false; setVoiceNotice("Đã chọn giọng. Chạm Thử giọng đọc để kiểm tra."); reportReadiness();};
  const testChime = () => {stopSpeech(); setMediaNotice("Đang thử chuông…"); void chime();};
  return {soundMode,setSoundMode,active: visible ? active : null, durationMs, waiting: Math.max(0, queue.length - 1), soundEnabled: soundMode!=="silent", soundReady: readiness.ready, soundNeedsGesture: readiness.needsGesture, audioNotice, toggleSound: activateSound, testSound, testChime, voiceOptions, selectedVoice, chooseVoice, voiceSummary, observeDashboard, restrictAlerts, resetAlerts, observeOrders, chime, dismiss};
}

export function NewOrderPopup({alert, waiting, durationMs = ADMIN_ALERT_DURATION_MS, onDismiss, onOpenTable}: {alert: AdminAlert | null; waiting: number; durationMs?: number; onDismiss: () => void; onOpenTable: (tableId: string) => void}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const popup = ref.current;
    if (!popup) return;
    try {if (typeof popup.showPopover === "function") popup.showPopover(); else popup.removeAttribute("popover");} catch {popup.removeAttribute("popover");}
    return () => {try {popup.hidePopover?.();} catch { /* Already removed. */ }};
  }, [alert?.id]);
  if (!alert) return null;
  const opening = isOpeningAlert(alert);
  const support = isSupportAlert(alert);
  return <div key={alert.id} ref={ref} popover="manual" className="admin-order-popup" role="status" aria-live="polite" aria-atomic="true">
    <span className="admin-order-popup-icon">{opening ? <DoorOpen size={25}/> : <BellRing size={25}/>}</span>
    <div className="admin-order-popup-content"><span className="admin-order-popup-label">{support ? "BÀN CẦN HỖ TRỢ" : opening ? "YÊU CẦU MỞ BÀN MỚI" : "CÓ ĐƠN GỌI MÓN MỚI"}</span><strong>{adminAlertSpeech(alert)}</strong><p>{support ? "Đang chờ nhân viên hỗ trợ" : opening ? (alert.customerName ? "Khách: " + alert.customerName + " · " : "") + "Đang chờ quản trị xác nhận" : <>{alert.orderCount} đơn mới · {money(alert.total)}{alert.customerName ? " · " + alert.customerName : ""}</>}</p><button type="button" onClick={() => {onOpenTable(alert.tableId); onDismiss();}}>{(opening || support) ? "Xem yêu cầu" : "Xử lý đơn"}<ArrowUpRight size={14}/></button></div>
    <button type="button" className="admin-order-popup-close" aria-label={opening ? "Ẩn thông báo, giữ yêu cầu mở bàn chờ xử lý" : "Ẩn thông báo, giữ đơn mới trên bàn"} onClick={onDismiss}><X size={18}/></button>
    {waiting > 0 && <span className="admin-order-popup-waiting">Còn {waiting} thông báo</span>}
    <span className="admin-order-popup-timer" key={alert.id} style={{animationDuration: `${durationMs}ms`}} aria-hidden="true"/>
  </div>;
}
