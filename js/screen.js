// شاشة العرض (البروجكتر) — للعرض فقط، ما بتكتب على حالة المسابقة
import { db, app } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  $,
  el,
  show,
  clock,
  syncClock,
  estimateClock,
  decorate,
  confetti,
  ring,
  podium,
  rows,
  LETTERS,
} from "./common.js";

decorate();
const R = document.documentElement;
const fit = () =>
  R.style.setProperty("--k", Math.min(innerWidth / 1280, innerHeight / 720));
addEventListener("resize", fit);
fit();

const timer = ring("xl");
$("ringSlot").append(timer.node);

let st = { phase: "lobby" },
  tick = 0,
  builtQ = null,
  isAdmin = false,
  unsubA = null,
  watchQ = null,
  playerNames = [],
  celebrated = "";

/* ---------- رابط الدخول + QR ---------- */
const joinUrl = new URL("./", location.href).href;
$("url").textContent = joinUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
function drawQR() {
  if (!window.QRCode) return setTimeout(drawQR, 300);
  $("qr").replaceChildren();
  new QRCode($("qr"), {
    text: joinUrl,
    width: 236,
    height: 236,
    colorDark: "#17264F",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}
addEventListener("load", drawQR);

/* ---------- لو الأدمن مسجّل دخول بنفس المتصفح: بنعرض العدّادات ---------- */
onAuthStateChanged(getAuth(app), (u) => {
  if (!u || isAdmin) return;
  isAdmin = true;
  syncClock(doc(db, "live", "clock"), { t: serverTimestamp() }, "t").catch(
    () => {},
  );
  onSnapshot(
    collection(db, "players"),
    (c) => {
      playerNames = c.docs
        .map((d) => ({
          n: d.data().name,
          t: d.data().joinedAt?.toMillis?.() || 0,
        }))
        .sort((a, b) => b.t - a.t);
      $("lCount").hidden = false;
      $("lCount").textContent = `${c.size} مشارك جاهز`;
      drawNames();
    },
    () => {},
  );
  render();
});

function drawNames() {
  const box = $("names");
  box.replaceChildren();
  playerNames.slice(0, 24).forEach((p, i) => {
    const c = el("span", "nchip", p.n);
    c.style.setProperty("--i", i);
    box.append(c);
  });
}

function watchAnswers() {
  if (!isAdmin || watchQ === st.qid) return;
  unsubA?.();
  watchQ = st.qid;
  $("qAns").hidden = false;
  $("ac").textContent = 0;
  unsubA = onSnapshot(
    query(collection(db, "answers"), where("q", "==", st.qid)),
    (c) => ($("ac").textContent = c.size),
    () => {},
  );
}

/* ---------- الحالة ---------- */
onSnapshot(doc(db, "live", "state"), (s) => {
  const next = s.data() || { phase: "lobby" };
  if (next.phase === "question")
    estimateClock(next.startedAt, s.metadata.hasPendingWrites);
  st = next;
  render();
});

function setMood(light) {
  document.body.classList.toggle("light", light);
}
function progress() {
  $("pb").style.width = st.total ? ((st.idx + 1) / st.total) * 100 + "%" : "0";
}

function render() {
  clearInterval(tick);
  progress();
  $("corner").classList.toggle("off", st.phase === "lobby" || !st.phase);
  switch (st.phase) {
    case "question":
      return question();
    case "results":
      return results();
    case "board":
    case "final":
      return board();
    default:
      builtQ = null;
      setMood(false);
      show("lobby");
  }
}

function optionEl(t, i, tag = "div") {
  const o = el(tag, "opt");
  o.style.setProperty("--c", `var(--o${i})`);
  o.style.setProperty("--t", `var(--t${i})`);
  o.append(el("span", "let", LETTERS[i]), el("span", "txt", t));
  return o;
}

function question() {
  setMood(true);
  if (builtQ !== st.qid) {
    builtQ = st.qid;
    $("qn").textContent = `السؤال ${st.idx + 1} من ${st.total}`;
    $("qt").textContent = st.text;
    $("op").replaceChildren(...st.options.map((t, i) => optionEl(t, i)));
    $("op").dataset.n = st.options.length;
  }
  watchAnswers();
  show("q");
  const run = () => {
    const t0 = st.startedAt?.toMillis?.(),
      D = st.duration * 1000;
    const left = t0 ? Math.max(0, D - (clock.now() - t0)) : D;
    timer.set(left, D);
    if (left <= 0) clearInterval(tick);
  };
  run();
  if (st.startedAt) tick = setInterval(run, 100);
}

function results() {
  setMood(true);
  builtQ = null;
  $("rn").textContent = `السؤال ${st.idx + 1} من ${st.total}`;
  $("rt").textContent = st.text;
  const counts = st.stats || [],
    total = counts.reduce((a, b) => a + b, 0),
    max = Math.max(1, ...counts);
  const box = $("rbars");
  box.replaceChildren();
  st.options.forEach((t, i) => {
    const r = optionEl(t, i);
    r.classList.add("sbar");
    if (i === st.correct) r.classList.add("right");
    const f = el("i");
    f.style.setProperty("--w", (counts[i] / max) * 100 + "%");
    r.prepend(f);
    r.append(
      el(
        "b",
        "",
        `${counts[i] || 0}${total ? ` · ${Math.round(((counts[i] || 0) / total) * 100)}%` : ""}`,
      ),
    );
    r.style.setProperty("--i", i);
    box.append(r);
  });
  show("res");
}

function board() {
  setMood(false);
  builtQ = null;
  const fin = st.phase === "final",
    L = st.board || [];
  $("bChip").textContent = fin
    ? "Engineering & Technology Club"
    : `بعد السؤال ${st.idx + 1} من ${st.total}`;
  $("bh").innerHTML = fin
    ? "الفائزين <em>بالمسابقة</em> 🏆"
    : "الترتيب <em>الحالي</em>";
  podium($("podium"), L);
  rows($("ls"), L, { from: 3, limit: fin ? 7 : 7, delta: !fin });
  show("bd");
  if (fin && celebrated !== st.run) {
    celebrated = st.run;
    confetti(9000);
  }
}

/* ---------- ملء الشاشة ---------- */
const fs = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : R.requestFullscreen?.();
$("fs").onclick = fs;
addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F" || e.key === "ب") fs();
});
