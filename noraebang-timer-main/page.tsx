"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MINUTE_OPTIONS, WARNING_MS } from "@/lib/constants";

type Room = {
  id: number;
  status: "idle" | "running";
  endTime: number | null;
};

const POLL_MS = 3000;

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [clockOffset, setClockOffset] = useState(0); // serverTime - Date.now()
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const alertedRef = useRef<Set<number>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<any>(null);
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- 서버와 동기화 (폴링) ----
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`서버 응답 오류 (${res.status}) ${body}`.trim());
      }
      const data = await res.json();
      if (!Array.isArray(data.rooms)) {
        throw new Error("서버에서 받은 방 정보 형식이 올바르지 않습니다.");
      }
      setRooms(data.rooms);
      setClockOffset(data.serverTime - Date.now());
      setError(null);
    } catch (e: any) {
      setError(
        "서버 연결 실패: Vercel 환경변수(UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)가 " +
          "제대로 설정됐는지 확인해주세요. (" +
          (e?.message || "알 수 없는 오류") +
          ")"
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, POLL_MS);
    return () => clearInterval(id);
  }, [fetchRooms]);

  // ---- 1초마다 화면 갱신용 시계 ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- 서비스워커 등록 (크롬 "홈 화면에 추가" 시 앱처럼 전체화면으로 열리게 해줌) ----
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // ---- Wake Lock (화면 꺼짐 방지, 카운터 거치용) ----
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
    } catch (e) {
      // 지원 안 하거나 실패해도 무시
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  // ---- 소리 켜기 (최초 1번 탭 필요 - 브라우저 자동재생 정책) ----
  const enableSound = useCallback(async () => {
    setSoundOn(true);
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    requestWakeLock();
  }, [requestWakeLock]);

  const beep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.35 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0 + i * 0.35);
      osc.stop(t0 + i * 0.35 + 0.3);
    }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  }, []);

  const remainingOf = useCallback(
    (room: Room) => {
      if (room.status !== "running" || !room.endTime) return null;
      return room.endTime - (now + clockOffset);
    },
    [now, clockOffset]
  );

  // ---- 6분 전 경고 감지: 빨간색 표시 + 반복 알람음/진동 ----
  useEffect(() => {
    const warningRooms = rooms.filter((r) => {
      const rem = remainingOf(r);
      return rem !== null && rem > 0 && rem <= WARNING_MS;
    });

    warningRooms.forEach((r) => {
      if (!alertedRef.current.has(r.id)) {
        alertedRef.current.add(r.id);
        if (soundOn) beep();
      }
    });

    rooms.forEach((r) => {
      const rem = remainingOf(r);
      if (rem === null || rem > WARNING_MS || rem <= 0) {
        alertedRef.current.delete(r.id);
      }
    });

    if (soundOn && warningRooms.length > 0) {
      if (!beepIntervalRef.current) {
        beepIntervalRef.current = setInterval(() => {
          const stillWarning = rooms.some((r) => {
            const rem = remainingOf(r);
            return rem !== null && rem > 0 && rem <= WARNING_MS;
          });
          if (stillWarning) beep();
        }, 15000);
      }
    } else if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, now, clockOffset, soundOn]);

  // ---- 액션 ----
  const addMinutes = async (roomId: number, minutes: number) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              status: "running",
              endTime:
                r.status === "running" && r.endTime
                  ? r.endTime + minutes * 60000
                  : Date.now() + clockOffset + minutes * 60000,
            }
          : r
      )
    );
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", roomId, minutes }),
      });
      if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
    } catch (e: any) {
      setError("시간 추가 실패: " + (e?.message || "알 수 없는 오류"));
    }
    fetchRooms();
  };

  const resetRoom = async (roomId: number) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, status: "idle", endTime: null } : r))
    );
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", roomId }),
      });
      if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
    } catch (e: any) {
      setError("초기화 실패: " + (e?.message || "알 수 없는 오류"));
    }
    setSelected(null);
    fetchRooms();
  };

  const fmt = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return { m, s };
  };

  const selectedRoom = rooms.find((r) => r.id === selected) || null;

  return (
    <main className="page">
      <header className="header">
        <div className="title">룸 타이머 보드</div>
        {!soundOn ? (
          <button className="alert-btn" onClick={enableSound}>
            🔔 소리 켜기 (최초 1회 탭)
          </button>
        ) : (
          <div className="alert-on">🔔 알람 소리 켜짐</div>
        )}
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={fetchRooms}>다시 시도</button>
        </div>
      )}

      {!error && loaded && rooms.length === 0 && (
        <div className="error-banner" style={{ background: "#3a3a4a" }}>
          <span>방 정보를 불러오는 중입니다...</span>
          <button onClick={fetchRooms}>새로고침</button>
        </div>
      )}

      <div className="room-grid">
        {rooms.map((room) => {
          const rem = remainingOf(room);
          const isWarning = rem !== null && rem > 0 && rem <= WARNING_MS;
          const isExpired = rem !== null && rem <= 0;
          const { m, s } = rem !== null ? fmt(rem) : { m: 0, s: 0 };
          const isSelected = selected === room.id;

          let bg = "#e8eef5"; // 빈방
          let labelBg = "#5b6b7c";
          if (room.status === "running") {
            bg = "#dfeaf5";
            labelBg = "#6a4fc9";
          }
          if (isWarning) {
            bg = "#ff5c5c";
            labelBg = "#b91c1c";
          }
          if (isExpired) {
            bg = "#c0392b";
            labelBg = "#7f1d1d";
          }
          if (isSelected) {
            bg = "#ffe14d";
            labelBg = "#7a6400";
          }

          return (
            <button
              key={room.id}
              className="room-card"
              onClick={() => setSelected(room.id)}
              style={{
                background: bg,
                animation: isWarning || isExpired ? "pulse 1s infinite" : undefined,
              }}
            >
              <div className="room-label" style={{ background: labelBg }}>
                {room.id}호
              </div>
              <div className="room-body">
                {room.status === "running" ? (
                  <span
                    className="room-time"
                    style={{ color: isWarning || isExpired ? "#fff" : "#1a1a2e" }}
                  >
                    {isExpired ? "시간종료" : `${m}분 ${s.toString().padStart(2, "0")}초`}
                  </span>
                ) : (
                  <span className="room-idle">빈방</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedRoom && (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-title">{selectedRoom.id}호 시간 추가</div>
            <div className="minute-grid">
              {MINUTE_OPTIONS.map((min) => (
                <button
                  key={min}
                  className="minute-btn"
                  onClick={() => addMinutes(selectedRoom.id, min)}
                >
                  +{min}분
                </button>
              ))}
            </div>
            <div className="sheet-actions">
              <button className="reset-btn" onClick={() => resetRoom(selectedRoom.id)}>
                방 초기화(퇴실)
              </button>
              <button className="close-btn" onClick={() => setSelected(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
