// لوحة التحكم
import { db, app } from "./firebase-config.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  $,
  el,
  show,
  store,
  clock,
  syncClock,
  estimateClock,
  netWatcher,
  decorate,
  ring,
  rows,
  LETTERS,
} from "./common.js";

decorate();

const auth = getAuth(app);
const stateRef = doc(db, "live", "state");
const timer = ring("lg");
$("ringSlot").append(timer.node);
const net = netWatcher($("net"));

let bank = [],
  players = {},
  scores = {},
  idx = 0,
  run = "",
  st = {},
  busy = false,
  started = false;
let unsubA = null,
  watchQ = null,
  liveCounts = [],
  answered = 0;

/* ---------- الدخول ---------- */
show("boot");
const AUTH_ERR = {
  "auth/invalid-credential": "الإيميل أو كلمة السر غلط",
  "auth/wrong-password": "كلمة السر غلط",
  "auth/user-not-found": "ما في حساب بهالإيميل",
  "auth/too-many-requests": "محاولات كثير، استنى شوي وجرب",
  "auth/network-request-failed": "مشكلة بالإنترنت",
};
$("lgForm").onsubmit = async (e) => {
  e.preventDefault();
  $("lgBtn").disabled = true;
  $("lgErr").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value);
  } catch (x) {
    $("lgErr").textContent = AUTH_ERR[x.code] || "خطأ بالدخول";
  }
  $("lgBtn").disabled = false;
};
$("out").onclick = () => signOut(auth).then(() => location.reload());

onAuthStateChanged(auth, (u) => {
  if (u && !started) {
    started = true;
    init().catch((e) => toast("ما قدرنا نحمّل اللوحة: " + e.message, true));
  } else if (!u) {
    $("ad").hidden = true;
    $("nav").hidden = true;
    $("lgWrap").hidden = false;
    show("lg");
  }
});

/* ---------- الإعدادات المحفوظة ---------- */
$("du").value = store.get("dur") || 20;
$("du").onchange = () => {
  const v = Math.min(120, Math.max(5, +$("du").value || 20));
  $("du").value = v;
  store.set("dur", v);
};
$("auto").checked = store.get("auto") !== "0";
$("auto").onchange = () => store.set("auto", $("auto").checked ? "1" : "0");

/* ---------- التشغيل ---------- */
async function init() {
  $("lgWrap").hidden = true;
  $("ad").hidden = false;
  $("nav").hidden = false;
  syncClock(doc(db, "live", "clock"), { t: serverTimestamp() }, "t").catch(
    () => {},
  );

  bank = (await getDoc(doc(db, "bank", "main"))).data()?.list || [];

  onSnapshot(collection(db, "players"), (c) => {
    c.forEach((d) => (players[d.id] = d.data().name));
    $("pc").textContent = c.size;
  });

  const first = (await getDoc(stateRef)).data() || {};
  run = first.run || "";
  idx =
    first.idx != null ? first.idx + (first.phase === "question" ? 0 : 1) : 0;
  (first.board || []).forEach((x) => (scores[x.u] = { n: x.n, s: x.s, d: 0 }));

  onSnapshot(stateRef, { includeMetadataChanges: true }, (s) => {
    net(s.metadata.fromCache);
    st = s.data() || {};
    if (st.phase === "question") {
      estimateClock(st.startedAt, s.metadata.hasPendingWrites);
      watchAnswers(st.qid);
    } else stopAnswers();
    draw();
  });

  setInterval(tickTimer, 200);
}

function watchAnswers(qid) {
  if (watchQ === qid) return;
  stopAnswers();
  watchQ = qid;
  liveCounts = (st.options || []).map(() => 0);
  answered = 0;
  unsubA = onSnapshot(
    query(collection(db, "answers"), where("q", "==", qid)),
    (c) => {
      liveCounts = (st.options || []).map(() => 0);
      c.forEach((d) => {
        const k = d.data().c;
        if (k in liveCounts) liveCounts[k]++;
      });
      answered = c.size;
      $("ac").textContent = answered;
      drawDist();
    },
  );
}
function stopAnswers() {
  unsubA?.();
  unsubA = null;
  watchQ = null;
}

function leftMs() {
  const t0 = st.startedAt?.toMillis?.();
  return t0 ? st.duration * 1000 - (clock.now() - t0) : st.duration * 1000;
}

function tickTimer() {
  if (st.phase !== "question" || !st.startedAt) return timer.clear();
  const left = leftMs();
  timer.set(Math.max(0, left), st.duration * 1000);
  // ثانية سماح عشان آخر الإجابات توصل السيرفر
  if ($("auto").checked && left <= -1200 && !busy) closeQuestion();
}

/* ---------- الإجراءات ---------- */
async function startQuestion() {
  const q = bank[idx];
  if (!q) return;
  if (!run) run = Date.now().toString(36);
  $("ac").textContent = 0;
  await setDoc(stateRef, {
    phase: "question",
    run,
    idx,
    total: bank.length,
    // معرّف فريد حتى لو انعاد نفس السؤال
    qid: `${run}-${idx}-${Date.now().toString(36).slice(-4)}`,
    text: q.q,
    options: q.o,
    duration: +$("du").value || 20,
    startedAt: serverTimestamp(),
    board: st.board || [],
  });
}

async function closeQuestion() {
  if (busy || st.phase !== "question") return;
  busy = true;
  try {
    const q = bank[st.idx] || { a: st.correct, o: st.options };
    const t0 = st.startedAt.toMillis(),
      D = st.duration * 1000,
      pts = {};
    const stats = st.options.map(() => 0);
    (
      await getDocs(query(collection(db, "answers"), where("q", "==", st.qid)))
    ).forEach((d) => {
      const a = d.data();
      players[a.u] = a.n;
      if (a.c in stats) stats[a.c]++;
      if (a.c !== q.a || !a.t) return;
      const used = Math.min(Math.max(a.t.toMillis() - t0, 0), D);
      pts[a.u] = Math.round(500 + 500 * (1 - used / D));
    });
    Object.keys(players).forEach((u) => {
      const p = scores[u] || (scores[u] = { s: 0 });
      p.n = players[u];
      p.d = pts[u] || 0;
      p.s += p.d;
    });
    const board = Object.entries(scores)
      .map(([u, p]) => ({ u, n: p.n, s: p.s, d: p.d }))
      .sort((a, b) => b.s - a.s || b.d - a.d || a.n.localeCompare(b.n, "ar"));
    const next = st.idx + 1;
    await updateDoc(stateRef, {
      phase: "results",
      correct: q.a,
      board,
      stats,
      options: st.options,
    });
    idx = next;
  } catch (e) {
    toast("خطأ: " + e.message, true);
  }
  busy = false;
  draw();
}

const showBoard = () =>
  updateDoc(stateRef, { phase: idx >= bank.length ? "final" : "board" });
const finishNow = () =>
  confirm("إنهاء المسابقة وعرض النتيجة النهائية؟") &&
  updateDoc(stateRef, { phase: "final" });

async function reset() {
  if (!confirm("متأكد بدك تصفّر المسابقة؟ كل النقاط رح تنمسح.")) return;
  scores = {};
  idx = 0;
  run = "";
  await setDoc(stateRef, { phase: "lobby", board: [] });
  toast("تم التصفير ✓");
}

function primaryAction() {
  const p = st.phase,
    b = $("primary");
  if (b.disabled) return;
  b.disabled = true;
  const done = () => {
    b.disabled = false;
    draw();
  };
  const job =
    p === "question"
      ? closeQuestion()
      : p === "results"
        ? showBoard()
        : startQuestion();
  Promise.resolve(job)
    .catch((e) => toast("خطأ: " + e.message, true))
    .finally(done);
}

$("primary").onclick = primaryAction;
$("finish").onclick = finishNow;
$("rs").onclick = reset;
$("csv").onclick = exportCSV;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || $("ad").hidden) return;
  if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName))
    return;
  e.preventDefault();
  primaryAction();
});

/* ---------- الأسئلة ---------- */
function validate(list) {
  if (!Array.isArray(list)) throw new Error("الملف لازم يكون مصفوفة [ ... ]");
  if (!list.length) throw new Error("الملف فاضي");
  return list.map((x, i) => {
    const n = i + 1;
    if (!x || typeof x.q !== "string" || !x.q.trim())
      throw new Error(`السؤال ${n}: نص السؤال (q) ناقص`);
    if (!Array.isArray(x.o) || x.o.length < 2 || x.o.length > 4)
      throw new Error(`السؤال ${n}: لازم 2 لـ 4 خيارات (o)`);
    if (x.o.some((o) => typeof o !== "string" && typeof o !== "number"))
      throw new Error(`السؤال ${n}: الخيارات لازم تكون نصوص`);
    if (!Number.isInteger(x.a) || x.a < 0 || x.a >= x.o.length)
      throw new Error(
        `السؤال ${n}: رقم الإجابة (a) لازم يكون من 0 لـ ${x.o.length - 1}`,
      );
    return { q: x.q.trim(), o: x.o.map((o) => String(o).trim()), a: x.a };
  });
}

$("fl").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const list = validate(JSON.parse(await f.text()));
    if (
      st.phase &&
      st.phase !== "lobby" &&
      !confirm("المسابقة شغّالة. استبدال الأسئلة الآن؟")
    )
      return;
    await setDoc(doc(db, "bank", "main"), { list });
    bank = list;
    if (idx > bank.length) idx = bank.length;
    toast(`انحفظ ${list.length} سؤال ✓`);
    draw();
  } catch (x) {
    toast(x instanceof SyntaxError ? "الملف مش JSON صحيح" : x.message, true);
  }
};

$("dl").onclick = () =>
  download("questions.json", JSON.stringify(bank, null, 2), "application/json");

function drawBank() {
  $("bk").textContent = bank.length ? `(${bank.length})` : "(فاضي)";
  const ol = $("bankList");
  ol.replaceChildren();
  if (!bank.length) {
    ol.append(el("li", "empty", "ارفع ملف questions.json للبدء"));
    return;
  }
  const locked = st.phase === "question";
  bank.forEach((q, i) => {
    const li = el(
      "li",
      (i < idx ? "done" : "") +
        (i === idx ? " next" : "") +
        (st.phase === "question" && st.idx === i ? " now" : ""),
    );
    li.append(el("b", "", i + 1), el("span", "", q.q));
    li.title = "الإجابة: " + q.o[q.a];
    if (!locked)
      li.onclick = () => {
        if (i === idx) return;
        if (i < idx && !confirm(`السؤال ${i + 1} انسأل قبل. تعيد سؤاله؟`))
          return;
        idx = i;
        draw();
      };
    ol.append(li);
  });
}

/* ---------- الرسم ---------- */
const PHASE = {
  lobby: "بانتظار البدء",
  question: "سؤال شغّال",
  results: "نتيجة السؤال",
  board: "عرض الترتيب",
  final: "انتهت المسابقة",
};

function draw() {
  const p = st.phase || "lobby";
  $("phase").textContent = PHASE[p] || p;
  $("phase").className =
    "chip" + (p === "question" ? " hot" : p === "final" ? " gold" : "");
  $("qPos").textContent =
    st.total && p !== "lobby"
      ? `السؤال ${st.idx + 1} من ${st.total}`
      : bank.length
        ? `${bank.length} سؤال جاهز`
        : "";
  $("qt").textContent =
    p === "question" || p === "results"
      ? st.text
      : p === "final"
        ? "انتهت المسابقة 🏆"
        : bank[idx]
          ? `التالي: ${bank[idx].q}`
          : bank.length
            ? "خلصت الأسئلة"
            : "ارفع الأسئلة للبدء";
  if (p !== "question")
    $("ac").textContent =
      p === "results" ? (st.stats || []).reduce((a, b) => a + b, 0) : "–";

  const b = $("primary");
  b.className = "btn big";
  if (p === "question") {
    b.textContent = "إنهاء السؤال الآن";
    b.classList.add("danger");
    b.disabled = busy;
  } else if (p === "results")
    b.textContent =
      idx >= bank.length ? "عرض النتيجة النهائية 🏆" : "عرض الترتيب";
  else if (p === "final") {
    b.textContent = "انتهت المسابقة";
    b.disabled = true;
  } else if (!bank.length) {
    b.textContent = "ارفع الأسئلة أولاً";
    b.disabled = true;
  } else if (idx >= bank.length) {
    b.textContent = "خلصت الأسئلة";
    b.disabled = true;
  } else {
    b.textContent = `ابدأ السؤال ${idx + 1} ▶`;
    b.disabled = false;
  }

  $("finish").hidden = !(
    p === "board" ||
    (p === "results" && idx < bank.length)
  );
  $("csv").hidden = !(st.board || []).length;

  drawDist();
  const showB =
    (p === "board" || p === "final" || p === "results") &&
    (st.board || []).length;
  $("boardCard").hidden = !showB;
  if (showB) {
    $("bCount").textContent = `(${st.board.length} لاعب)`;
    rows($("ls"), st.board, { from: 0, limit: 15, delta: p !== "final" });
  }
  drawBank();
}

function drawDist() {
  const node = $("dist"),
    p = st.phase;
  node.replaceChildren();
  if (p !== "question" && p !== "results") return;
  const counts = p === "results" ? st.stats || [] : liveCounts;
  const correct = p === "results" ? st.correct : bank[st.idx]?.a;
  const max = Math.max(1, ...counts);
  (st.options || []).forEach((o, i) => {
    const r = el("div", "dbar" + (i === correct ? " right" : ""));
    r.style.setProperty("--c", `var(--o${i})`);
    r.style.setProperty("--t", `var(--t${i})`);
    const f = el("i");
    f.style.width = ((counts[i] || 0) / max) * 100 + "%";
    r.append(
      f,
      el("span", "let", LETTERS[i]),
      el("span", "txt", o),
      el("b", "", counts[i] || 0),
    );
    node.append(r);
  });
}

/* ---------- أدوات ---------- */
function exportCSV() {
  const L = st.board || [];
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    ["الترتيب", "الاسم", "النقاط"].map(esc).join(","),
    ...L.map((x, i) => [i + 1, x.n, x.s].map(esc).join(",")),
  ];
  download(
    `etc-results-${new Date().toISOString().slice(0, 10)}.csv`,
    "﻿" + lines.join("\r\n"),
    "text/csv;charset=utf-8",
  );
}

function download(name, text, type) {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

let toastT = 0;
function toast(msg, err) {
  document.querySelector(".toast")?.remove();
  const t = el("div", "toast" + (err ? " err" : ""), msg);
  document.body.append(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 3800);
}
