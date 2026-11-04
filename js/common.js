// أدوات مشتركة بين صفحة اللاعب، لوحة التحكم، وشاشة العرض
import {
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export const FS = "https://www.gstatic.com/firebasejs/11.0.2/";
export const LETTERS = ["أ", "ب", "ج", "د"];

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// إظهار شاشة وحدة فقط من الشاشات اللي عليها data-view
export function show(id) {
  document.querySelectorAll("[data-view]").forEach((v) => {
    const on = v.id === id;
    if (on && v.hidden) {
      v.hidden = false;
      v.classList.remove("enter");
      void v.offsetWidth;
      v.classList.add("enter");
    } else if (!on) v.hidden = true;
  });
}

// localStorage آمن (بعض المتصفحات بالوضع الخاص بترمي خطأ)
export const store = {
  get(k) {
    try {
      return localStorage.getItem("etc:" + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("etc:" + k, v);
    } catch {}
    return v;
  },
  del(k) {
    try {
      localStorage.removeItem("etc:" + k);
    } catch {}
  },
};

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export const cleanName = (s) => s.replace(/\s+/g, " ").trim().slice(0, 24);

/* ---------- ساعة متزامنة مع السيرفر ---------- */
// العدّاد عند الكل لازم يمشي على وقت السيرفر، مش على ساعة الجهاز
export const clock = {
  off: 0,
  synced: false,
  now() {
    return Date.now() + this.off;
  },
};

// بنكتب serverTimestamp وبنقيس الفرق لما يرجع من السيرفر
export function syncClock(ref, data, field) {
  return new Promise((resolve, reject) => {
    let sawPending = false,
      t0 = 0;
    const stop = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (s) => {
        if (s.metadata.hasPendingWrites) {
          sawPending = true;
          return;
        }
        const ts = s.data()?.[field];
        if (!sawPending || !ts?.toMillis) return;
        clock.off = ts.toMillis() - (t0 + Date.now()) / 2;
        clock.synced = true;
        stop();
        resolve(clock.off);
      },
      reject,
    );
    t0 = Date.now();
    setDoc(ref, data).catch((e) => {
      stop();
      reject(e);
    });
  });
}

// تقدير احتياطي لو ما قدرنا نزامن: لحظة وصول بداية السؤال ≈ startedAt
export function estimateClock(startedAt, pending) {
  if (clock.synced || pending || !startedAt?.toMillis) return;
  const off = startedAt.toMillis() - Date.now();
  if (Math.abs(off) > 3000) {
    clock.off = off;
  }
  clock.synced = true;
}

/* ---------- مؤشر الاتصال ---------- */
export function netWatcher(node) {
  let t = 0,
    cached = true;
  const paint = () => {
    node.hidden = navigator.onLine && !cached;
  };
  addEventListener("online", paint);
  addEventListener("offline", paint);
  return (fromCache) => {
    cached = fromCache;
    clearTimeout(t);
    if (fromCache) t = setTimeout(paint, 2500);
    else paint();
  };
}

/* ---------- زخارف الهوية (ترس، دوائر، جسيمات) ---------- */
export function gearSVG() {
  const n = 18,
    r1 = 100,
    r2 = 118,
    w = Math.PI / n,
    pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    [
      [r2, t - w * 0.35],
      [r2, t + w * 0.35],
      [r1, t + w * 0.7],
      [r1, t + w * 1.3],
    ].forEach(([r, a]) =>
      pts.push(
        `${(150 + Math.cos(a) * r * 1.25).toFixed(1)},${(150 + Math.sin(a) * r * 1.25).toFixed(1)}`,
      ),
    );
  }
  return `<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1.6"><polygon points="${pts.join(" ")}"/><circle cx="150" cy="150" r="92"/><circle cx="150" cy="150" r="70" stroke-dasharray="3 7"/></svg>`;
}

const CIRCUIT = `<svg viewBox="0 0 320 320" fill="none"><g stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path pathLength="1" d="M12 22C130 22 240 80 292 190"/><path pathLength="1" d="M12 62C150 70 250 140 262 262"/><path pathLength="1" d="M120 20 172 74v70"/><path pathLength="1" d="M300 70v90"/></g><g stroke="currentColor" stroke-width="2.5" fill="var(--navy2)"><circle cx="12" cy="22" r="9"/><circle cx="292" cy="190" r="9"/><circle cx="172" cy="150" r="8"/><circle cx="300" cy="62" r="8"/><circle cx="262" cy="268" r="9"/></g></svg>`;

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function decorate() {
  const bg = el("div", "bg");
  bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = `<div class="sun"></div><div class="gear g1">${gearSVG()}</div><div class="gear g2">${gearSVG()}</div><div class="circ">${CIRCUIT}</div>`;
  const cv = el("canvas", "fx");
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(bg, cv);
  if (!calm) particles(cv);
}

function particles(cv) {
  const cx = cv.getContext("2d"),
    P = [],
    m = { x: -999, y: -999 };
  let W, H, dpr;
  const rs = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  rs();
  addEventListener("resize", rs);
  const N = innerWidth < 700 ? 28 : 55;
  for (let i = 0; i < N; i++)
    P.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
    });
  addEventListener(
    "pointermove",
    (e) => {
      m.x = e.clientX;
      m.y = e.clientY;
    },
    { passive: true },
  );
  (function f() {
    if (!document.hidden) {
      cx.clearRect(0, 0, W, H);
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        cx.fillStyle = "rgba(207,180,96,.45)";
        cx.beginPath();
        cx.arc(p.x, p.y, 2, 0, 6.3);
        cx.fill();
        for (let j = i + 1; j < P.length; j++) {
          const q = P[j],
            d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 120) {
            cx.strokeStyle = `rgba(207,180,96,${0.2 * (1 - d / 120)})`;
            cx.beginPath();
            cx.moveTo(p.x, p.y);
            cx.lineTo(q.x, q.y);
            cx.stroke();
          }
        }
        const dm = Math.hypot(p.x - m.x, p.y - m.y);
        if (dm < 150) {
          cx.strokeStyle = `rgba(37,132,198,${0.5 * (1 - dm / 150)})`;
          cx.beginPath();
          cx.moveTo(p.x, p.y);
          cx.lineTo(m.x, m.y);
          cx.stroke();
        }
      }
    }
    requestAnimationFrame(f);
  })();
}

/* ---------- قصاصات احتفال ---------- */
export function confetti(ms = 4500) {
  if (calm) return;
  const cv = el("canvas", "confetti"),
    cx = cv.getContext("2d");
  document.body.append(cv);
  const W = (cv.width = innerWidth),
    H = (cv.height = innerHeight);
  const C = [
    "#CFB460",
    "#F5E6AF",
    "#2584C6",
    "#6FB6EE",
    "#04A575",
    "#2BD6A0",
    "#ffffff",
  ];
  const P = Array.from({ length: Math.min(180, W / 4) }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.6,
    s: 5 + Math.random() * 7,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 2 + Math.random() * 3.5,
    r: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.3,
    c: C[(Math.random() * C.length) | 0],
  }));
  const end = performance.now() + ms;
  (function f(t) {
    cx.clearRect(0, 0, W, H);
    P.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      if (p.y > H + 20 && t < end - 1200) {
        p.y = -20;
        p.x = Math.random() * W;
      }
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillStyle = p.c;
      cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      cx.restore();
    });
    if (t < end + 2000) requestAnimationFrame(f);
    else cv.remove();
  })(performance.now());
}

/* ---------- عناصر متكررة ---------- */
// حلقة العدّاد: نفس حلقة Beyond the Lecture
export function ring(size = "") {
  const w = el("div", "ring " + size);
  w.innerHTML = `<svg viewBox="0 0 120 120"><circle class="r0" cx="60" cy="60" r="52"/><circle class="r1" cx="60" cy="60" r="52"/></svg><b></b>`;
  const fill = w.querySelector(".r1"),
    num = w.querySelector("b"),
    C = 2 * Math.PI * 52;
  fill.style.strokeDasharray = C;
  return {
    node: w,
    set(leftMs, totalMs) {
      const f = totalMs ? Math.max(0, Math.min(1, leftMs / totalMs)) : 0;
      fill.style.strokeDashoffset = C * (1 - f);
      num.textContent = Math.ceil(leftMs / 1000);
      w.classList.toggle("hurry", leftMs > 0 && leftMs <= 5000);
      w.classList.toggle("over", leftMs <= 0);
    },
    clear() {
      fill.style.strokeDashoffset = 0;
      num.textContent = "–";
      w.classList.remove("hurry", "over");
    },
  };
}

export function podium(node, list, meId) {
  node.replaceChildren();
  [
    [list[1], 2],
    [list[0], 1],
    [list[2], 3],
  ].forEach(([p, rank]) => {
    if (!p) return;
    const c = el("div", `pod p${rank}` + (p.u === meId ? " me" : ""));
    c.style.setProperty("--i", rank);
    c.append(
      el("span", "medal", ["🥇", "🥈", "🥉"][rank - 1]),
      el("span", "pn", p.n),
      el("span", "ps", p.s.toLocaleString("en")),
    );
    const bar = el("div", "pbar");
    bar.append(el("b", "", rank));
    c.append(bar);
    node.append(c);
  });
}

export function rows(
  node,
  list,
  { from = 3, limit = 20, meId, delta = false } = {},
) {
  node.replaceChildren();
  const add = (x, k) => {
    const r = el("div", "row" + (x.u === meId ? " me" : ""));
    r.style.setProperty("--i", k - from);
    r.append(el("span", "rk", k + 1), el("span", "nm", x.n));
    if (delta && x.d) r.append(el("small", "dl", "+" + x.d));
    r.append(el("b", "sc", x.s.toLocaleString("en")));
    node.append(r);
  };
  list.slice(from, from + limit).forEach((x, k) => add(x, k + from));
  const mi = meId ? list.findIndex((x) => x.u === meId) : -1;
  if (mi >= from + limit) {
    node.append(el("div", "gap", "⋯"));
    add(list[mi], mi);
  }
}
