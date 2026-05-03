"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, FormEvent, PointerEvent } from "react";
import QRCode from "qrcode";
import styles from "./page.module.css";

type Status = "open" | "preparing" | "soldout" | "paused";
type PersonChoice = "1" | "2" | "3" | "4" | "5+";

type Store = {
  id: string;
  name: string;
  pr: string;
  photo: string;
  menu: string;
  notes: string;
  video: string;
  status: Status;
  visible: boolean;
  x: number;
  y: number;
  capacity: number;
  secondsPerPerson: number;
  ticketEnabled: boolean;
  ticketSeq: number;
};

type QueueEvent = {
  id: string;
  storeId: string;
  startedAt: number;
  people: number;
  ticketNumber?: number;
};

type FestivalState = {
  stores: Store[];
  queueEvents: QueueEvent[];
  updatedAt: number;
};

const STORAGE_KEY = "koryo-independent-festival-v1";
const TAP_SIZE = 48;
const FLASH_MS = 2600;

const statusMeta: Record<Status, { label: string; pinClass: string; symbol: string }> = {
  open: { label: "営業中", pinClass: styles.openPin, symbol: "check" },
  preparing: { label: "準備中", pinClass: styles.preparingPin, symbol: "clock" },
  soldout: { label: "売り切れ", pinClass: styles.soldoutPin, symbol: "stop" },
  paused: { label: "一時停止", pinClass: styles.pausedPin, symbol: "pause" },
};

const initialStores: Store[] = [
  {
    id: "takoyaki",
    name: "青空たこ焼き",
    pr: "外は香ばしく中はとろっと仕上げます。",
    photo: "",
    menu: "たこ焼き 400円\nねぎ盛り 450円",
    notes: "熱いので受け取り時にご注意ください。",
    video: "",
    status: "open",
    visible: true,
    x: 22,
    y: 32,
    capacity: 8,
    secondsPerPerson: 70,
    ticketEnabled: true,
    ticketSeq: 14,
  },
  {
    id: "lemonade",
    name: "星屑レモネード",
    pr: "きりっと冷たい自家製シロップのドリンクです。",
    photo: "",
    menu: "レモネード 300円\nソーダ割り 350円",
    notes: "氷なしも選べます。",
    video: "",
    status: "preparing",
    visible: true,
    x: 44,
    y: 46,
    capacity: 12,
    secondsPerPerson: 35,
    ticketEnabled: false,
    ticketSeq: 0,
  },
  {
    id: "haunted",
    name: "ミステリー教室",
    pr: "短時間で楽しめる体験型アトラクションです。",
    photo: "",
    menu: "入場 200円",
    notes: "暗い場所が苦手な方はスタッフにお声がけください。",
    video: "",
    status: "open",
    visible: true,
    x: 64,
    y: 29,
    capacity: 6,
    secondsPerPerson: 120,
    ticketEnabled: true,
    ticketSeq: 31,
  },
  {
    id: "crepe",
    name: "花咲クレープ",
    pr: "フルーツとクリームを軽やかに包みます。",
    photo: "",
    menu: "チョコバナナ 450円\nいちご 500円",
    notes: "数量限定メニューがあります。",
    video: "",
    status: "soldout",
    visible: true,
    x: 76,
    y: 63,
    capacity: 5,
    secondsPerPerson: 90,
    ticketEnabled: false,
    ticketSeq: 4,
  },
];

function createInitialState(): FestivalState {
  const now = Date.now();
  return {
    stores: initialStores,
    queueEvents: [
      { id: "seed-takoyaki-1", storeId: "takoyaki", startedAt: now - 18 * 60_000, people: 2, ticketNumber: 12 },
      { id: "seed-takoyaki-2", storeId: "takoyaki", startedAt: now - 8 * 60_000, people: 3, ticketNumber: 13 },
      { id: "seed-haunted-1", storeId: "haunted", startedAt: now - 15 * 60_000, people: 4, ticketNumber: 30 },
    ],
    updatedAt: now,
  };
}

function uniqueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState(): FestivalState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as FestivalState;
    if (!Array.isArray(parsed.stores) || !Array.isArray(parsed.queueEvents)) return createInitialState();
    return parsed;
  } catch {
    return createInitialState();
  }
}

function saveState(next: FestivalState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("festival-state-change", { detail: next.updatedAt }));
}

function peopleValue(choice: PersonChoice) {
  return choice === "5+" ? 5 : Number(choice);
}

function isAnomaly(event: QueueEvent, events: QueueEvent[]) {
  const sameStoreRecent = events.filter(
    (item) => item.storeId === event.storeId && Math.abs(item.startedAt - event.startedAt) < 15_000,
  );
  return sameStoreRecent.length >= 3 || event.people < 1 || event.people > 8;
}

function queueForStore(store: Store, events: QueueEvent[]) {
  const now = Date.now();
  const relevant = events
    .filter((event) => event.storeId === store.id && !isAnomaly(event, events))
    .filter((event) => now - event.startedAt < 3 * 60 * 60_000);

  const firstHalfEvents = relevant.filter((event) => now - event.startedAt > 10 * 60_000);
  const arrivalsPerMinute =
    relevant.length > 1
      ? relevant.reduce((sum, event) => sum + event.people, 0) /
        Math.max(1, (now - Math.min(...relevant.map((event) => event.startedAt))) / 60_000)
      : 0;

  const adaptiveSeconds =
    firstHalfEvents.length >= 2
      ? Math.max(
          20,
          Math.min(240, store.secondsPerPerson * (1 + Math.min(0.35, arrivalsPerMinute / Math.max(10, store.capacity) / 3))),
        )
      : store.secondsPerPerson;

  const completedPeople = Math.floor(((now - Math.min(now, ...relevant.map((event) => event.startedAt))) / 1000) * store.capacity / adaptiveSeconds);
  const waitingPeople = Math.max(0, relevant.reduce((sum, event) => sum + event.people, 0) - completedPeople);
  const waitMinutes = Math.ceil((waitingPeople * adaptiveSeconds) / Math.max(1, store.capacity) / 60);

  return { waitingPeople, waitMinutes, adaptiveSeconds, ignored: events.filter((event) => event.storeId === store.id && isAnomaly(event, events)).length };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PinIcon({ status }: { status: Status }) {
  return <span className={`${styles.pinIcon} ${styles[statusMeta[status].symbol]}`} aria-hidden="true" />;
}

function waitClass(minutes: number) {
  if (minutes >= 30) return styles.waitHigh;
  if (minutes >= 15) return styles.waitMedium;
  return styles.waitLow;
}

export default function FestivalPage() {
  const [state, setState] = useState<FestivalState>(() => loadState());
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"visitor" | "exhibitor" | "admin" | "qr">("visitor");
  const [selectedId, setSelectedId] = useState<string>(state.stores.find((store) => store.visible)?.id ?? state.stores[0]?.id ?? "");
  const [editorId, setEditorId] = useState<string>(state.stores[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [flashId, setFlashId] = useState("");
  const [qrStoreId, setQrStoreId] = useState(state.stores[0]?.id ?? "");
  const [people, setPeople] = useState<PersonChoice>("1");
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [lastTicket, setLastTicket] = useState<{ storeId: string; ticketNumber?: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const fairnessRef = useRef(0);

  const visibleStores = state.stores.filter((store) => store.visible);
  const selectedStore = state.stores.find((store) => store.id === selectedId && store.visible) ?? visibleStores[0];
  const editorStore = state.stores.find((store) => store.id === editorId) ?? state.stores[0];
  const qrStore = state.stores.find((store) => store.id === qrStoreId) ?? state.stores[0];

  const queueStats = useMemo(() => {
    return Object.fromEntries(state.stores.map((store) => [store.id, queueForStore(store, state.queueEvents)]));
  }, [state]);

  useEffect(() => {
    setReady(true);
    const onStateChange = () => setState(loadState());
    window.addEventListener("storage", onStateChange);
    window.addEventListener("festival-state-change", onStateChange);
    const timer = window.setInterval(onStateChange, 5000);
    return () => {
      window.removeEventListener("storage", onStateChange);
      window.removeEventListener("festival-state-change", onStateChange);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    state.stores.forEach((store) => {
      const url = `${window.location.origin}/festival?mode=qr&store=${encodeURIComponent(store.id)}`;
      QRCode.toDataURL(url, { margin: 1, width: 180 }).then((dataUrl) => {
        setQrImages((current) => ({ ...current, [store.id]: dataUrl }));
      });
    });
  }, [state.stores]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const requestedStore = params.get("store");
    if (requestedMode === "qr") setMode("qr");
    if (requestedStore && state.stores.some((store) => store.id === requestedStore)) {
      setQrStoreId(requestedStore);
      setSelectedId(requestedStore);
    }
  }, [state.stores]);

  function commit(updater: (current: FestivalState) => FestivalState) {
    setState((current) => {
      const next = { ...updater(current), updatedAt: Date.now() };
      saveState(next);
      return next;
    });
  }

  function updateStore(storeId: string, patch: Partial<Store>) {
    commit((current) => ({
      ...current,
      stores: current.stores.map((store) => (store.id === storeId ? { ...store, ...patch } : store)),
    }));
  }

  function centerOnStore(store: Store) {
    setSelectedId(store.id);
    setFlashId(store.id);
    window.setTimeout(() => setFlashId((current) => (current === store.id ? "" : current)), FLASH_MS);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const mapWidth = 980 * zoom;
    const mapHeight = 640 * zoom;
    viewport.scrollTo({
      left: Math.max(0, (store.x / 100) * mapWidth - viewport.clientWidth / 2),
      top: Math.max(0, (store.y / 100) * mapHeight - viewport.clientHeight / 2),
      behavior: "smooth",
    });
  }

  function pickPin(clientX: number, clientY: number) {
    const map = mapRef.current;
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    const candidates = visibleStores
      .map((store) => {
        const screenX = rect.left + (store.x / 100) * rect.width;
        const screenY = rect.top + (store.y / 100) * rect.height;
        const hitDistance = Math.hypot(clientX - screenX, clientY - screenY);
        const centerBias = Math.hypot(screenX - window.innerWidth / 2, screenY - window.innerHeight / 2);
        return { store, hitDistance, centerBias };
      })
      .filter((candidate) => candidate.hitDistance <= TAP_SIZE / 2);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.hitDistance - b.hitDistance || a.centerBias - b.centerBias);
    const tied = candidates.filter((candidate) => candidate.hitDistance - candidates[0].hitDistance < 6);
    if (tied.length <= 1) return candidates[0].store;
    tied.sort((a, b) => a.centerBias - b.centerBias);
    fairnessRef.current = (fairnessRef.current + 1) % tied.length;
    return tied[fairnessRef.current].store;
  }

  function onMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    const picked = pickPin(event.clientX, event.clientY);
    if (picked) {
      setSelectedId(picked.id);
      setFlashId(picked.id);
      window.setTimeout(() => setFlashId((current) => (current === picked.id ? "" : current)), 1200);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>, field: "photo" | "video") {
    const file = event.target.files?.[0];
    if (!file || !editorStore) return;
    const dataUrl = await fileToDataUrl(file);
    updateStore(editorStore.id, { [field]: dataUrl } as Partial<Store>);
  }

  function submitQueue(event: FormEvent) {
    event.preventDefault();
    if (!qrStore) return;
    const queueEvent: QueueEvent = {
      id: uniqueId(),
      storeId: qrStore.id,
      startedAt: Date.now(),
      people: peopleValue(people),
    };

    let ticketNumber: number | undefined;
    commit((current) => {
      const stores = current.stores.map((store) => {
        if (store.id !== qrStore.id || !store.ticketEnabled) return store;
        ticketNumber = store.ticketSeq + 1;
        queueEvent.ticketNumber = ticketNumber;
        return { ...store, ticketSeq: ticketNumber };
      });
      return { ...current, stores, queueEvents: [...current.queueEvents, queueEvent] };
    });
    setLastTicket({ storeId: qrStore.id, ticketNumber });
  }

  if (!ready) {
    return (
      <main className={styles.shell}>
        <section className={styles.loadingPanel}>Loading...</section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Koryo Festival OS</p>
          <h1>文化祭マップ</h1>
        </div>
        <nav className={styles.tabs} aria-label="画面切り替え">
          <button className={mode === "visitor" ? styles.activeTab : ""} onClick={() => setMode("visitor")}>来場者</button>
          <button className={mode === "exhibitor" ? styles.activeTab : ""} onClick={() => setMode("exhibitor")}>出店者</button>
          <button className={mode === "admin" ? styles.activeTab : ""} onClick={() => setMode("admin")}>管理者</button>
          <button className={mode === "qr" ? styles.activeTab : ""} onClick={() => setMode("qr")}>QR</button>
        </nav>
      </header>

      {mode === "visitor" && (
        <section className={styles.visitorGrid}>
          <div className={styles.mapPanel}>
            <div className={styles.mapToolbar}>
              <button onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.15).toFixed(2))))} aria-label="縮小">−</button>
              <input
                aria-label="ズーム"
                type="range"
                min="0.75"
                max="2.2"
                step="0.05"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <button onClick={() => setZoom((current) => Math.min(2.2, Number((current + 0.15).toFixed(2))))} aria-label="拡大">＋</button>
            </div>
            <div className={styles.mapViewport} ref={viewportRef}>
              <div className={styles.mapCanvas} ref={mapRef} style={{ transform: `scale(${zoom})` }} onPointerUp={onMapPointerUp}>
                <div className={styles.schoolBlock} />
                <div className={styles.stageBlock} />
                <div className={styles.courtyardBlock} />
                {visibleStores.map((store) => {
                  const stats = queueStats[store.id];
                  return (
                    <button
                      key={store.id}
                      className={`${styles.pin} ${statusMeta[store.status].pinClass} ${waitClass(stats.waitMinutes)} ${flashId === store.id ? styles.flash : ""}`}
                      style={{ left: `${store.x}%`, top: `${store.y}%`, width: TAP_SIZE / zoom, height: TAP_SIZE / zoom }}
                      aria-label={`${store.name} ${statusMeta[store.status].label} 待ち時間 ${stats.waitMinutes}分`}
                      tabIndex={-1}
                    >
                      <span className={styles.pinShape} style={{ "--pin-scale": `${1 / zoom}` } as CSSProperties}>
                        <PinIcon status={store.status} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className={styles.storeList}>
            <h2>出店一覧</h2>
            {visibleStores.map((store) => {
              const stats = queueStats[store.id];
              return (
                <button key={store.id} className={selectedStore?.id === store.id ? styles.selectedStore : ""} onClick={() => centerOnStore(store)}>
                  <span>
                    <strong>{store.name}</strong>
                    <small>{statusMeta[store.status].label} / 約{stats.waitMinutes}分 / {stats.waitingPeople}人待ち</small>
                  </span>
                  <PinIcon status={store.status} />
                </button>
              );
            })}
          </aside>

          {selectedStore && (
            <section className={styles.popup} aria-live="polite">
              <div>
                <h2>{selectedStore.name}</h2>
                <p>{selectedStore.pr}</p>
                <dl>
                  <div><dt>ステータス</dt><dd>{statusMeta[selectedStore.status].label}</dd></div>
                  <div><dt>待ち時間</dt><dd>約{queueStats[selectedStore.id].waitMinutes}分</dd></div>
                  <div><dt>待ち人数</dt><dd>{queueStats[selectedStore.id].waitingPeople}人</dd></div>
                </dl>
                <pre>{selectedStore.menu}</pre>
                {selectedStore.photo && <img src={selectedStore.photo} alt={`${selectedStore.name} PR写真`} />}
              </div>
            </section>
          )}
        </section>
      )}

      {mode === "exhibitor" && editorStore && (
        <section className={styles.editorGrid}>
          <aside className={styles.storePicker}>
            {state.stores.map((store) => (
              <button key={store.id} className={editorStore.id === store.id ? styles.selectedStore : ""} onClick={() => setEditorId(store.id)}>
                {store.name}
              </button>
            ))}
          </aside>
          <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
            <h2>出店者管理</h2>
            <label>店舗名<input value={editorStore.name} onChange={(event) => updateStore(editorStore.id, { name: event.target.value })} /></label>
            <label>ステータス<select value={editorStore.status} onChange={(event) => updateStore(editorStore.id, { status: event.target.value as Status })}>
              {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select></label>
            <label>PR文<textarea value={editorStore.pr} onChange={(event) => updateStore(editorStore.id, { pr: event.target.value })} /></label>
            <label>メニュー<textarea value={editorStore.menu} onChange={(event) => updateStore(editorStore.id, { menu: event.target.value })} /></label>
            <label>注意事項<textarea value={editorStore.notes} onChange={(event) => updateStore(editorStore.id, { notes: event.target.value })} /></label>
            <label>PR写真<input type="file" accept="image/*" onChange={(event) => handleFile(event, "photo")} /></label>
            <label>PR動画<input type="file" accept="video/*" onChange={(event) => handleFile(event, "video")} /></label>
            <div className={styles.inlineFields}>
              <label>収容人数<input type="number" min="1" value={editorStore.capacity} onChange={(event) => updateStore(editorStore.id, { capacity: Number(event.target.value) || 1 })} /></label>
              <label>処理秒数<input type="number" min="10" value={editorStore.secondsPerPerson} onChange={(event) => updateStore(editorStore.id, { secondsPerPerson: Number(event.target.value) || 10 })} /></label>
            </div>
            <label className={styles.switchRow}><input type="checkbox" checked={editorStore.ticketEnabled} onChange={(event) => updateStore(editorStore.id, { ticketEnabled: event.target.checked })} />整理券を発行する</label>
            <p className={styles.saveNote}>変更は入力のたびに保存され、来場者マップへ即時反映されます。</p>
          </form>
        </section>
      )}

      {mode === "admin" && (
        <section className={styles.adminGrid}>
          <h2>管理者画面</h2>
          {state.stores.map((store) => (
            <article key={store.id} className={styles.adminRow}>
              <div>
                <strong>{store.name}</strong>
                <small>{store.visible ? "公開中" : "非公開"} / QR {store.id}</small>
              </div>
              <label className={styles.switchRow}><input type="checkbox" checked={store.visible} onChange={(event) => updateStore(store.id, { visible: event.target.checked })} />公開</label>
              <label>ピンX<input type="number" min="0" max="100" value={store.x} onChange={(event) => updateStore(store.id, { x: Number(event.target.value) })} /></label>
              <label>ピンY<input type="number" min="0" max="100" value={store.y} onChange={(event) => updateStore(store.id, { y: Number(event.target.value) })} /></label>
              {qrImages[store.id] && <img src={qrImages[store.id]} alt={`${store.name} QRコード`} />}
            </article>
          ))}
        </section>
      )}

      {mode === "qr" && qrStore && (
        <section className={styles.qrPanel}>
          <form className={styles.form} onSubmit={submitQueue}>
            <h2>{qrStore.name}</h2>
            <p>QRコード読み取り時刻を「並び始めた時刻」として記録します。</p>
            <label>店舗<select value={qrStore.id} onChange={(event) => setQrStoreId(event.target.value)}>
              {state.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select></label>
            <fieldset className={styles.peopleChoices}>
              <legend>人数</legend>
              {(["1", "2", "3", "4", "5+"] as PersonChoice[]).map((choice) => (
                <label key={choice}><input type="radio" name="people" checked={people === choice} onChange={() => setPeople(choice)} />{choice === "5+" ? "5人以上" : `${choice}人`}</label>
              ))}
            </fieldset>
            <button className={styles.primaryButton} type="submit">人数を送信</button>
            {lastTicket?.storeId === qrStore.id && qrStore.ticketEnabled && lastTicket.ticketNumber && (
              <output className={styles.ticket}>整理券番号 {lastTicket.ticketNumber}</output>
            )}
            {lastTicket?.storeId === qrStore.id && !qrStore.ticketEnabled && (
              <output className={styles.sent}>人数を記録しました</output>
            )}
          </form>
          {qrStore.video && lastTicket?.storeId === qrStore.id && (
            <video className={styles.video} src={qrStore.video} controls preload="metadata" />
          )}
          {qrImages[qrStore.id] && <img className={styles.qrImage} src={qrImages[qrStore.id]} alt={`${qrStore.name} QRコード`} />}
        </section>
      )}
    </main>
  );
}
