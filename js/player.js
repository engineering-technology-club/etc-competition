// صفحة اللاعب
import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  $,
  el,
  show,
  store,
  uid,
  cleanName,
  clock,
  syncClock,
  estimateClock,
  netWatcher,
  decorate,
  confetti,
  ring,
  podium,
  rows,
  LETTERS,
} from "./common.js";

decorate();

const pid = store.get("pid") || store.set("pid", uid());
let name = store.get("name") || "";
let st = { phase: "lobby" };
let tick = 0,
  builtQ = null,
  celebrated = store.get("cel") || "";

const meRef = doc(db, "players", pid);
const timer = ring();
$("ringSlot").append(timer.node);
const net = netWatcher($("net"));

/* ---------- تسجيل اللاعب ---------- */
function register() {
  syncClock(meRef, { name, joinedAt: serverTimestamp() }, "joinedAt").catch(
    () => {},
  );
}

$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  const v = cleanName($("nm").value);
  if (!v) return $("nm").focus();
  name = store.set("name", v);
  register();
  render();
};

$("rename").onclick = () => {
  $("nm").value = name;
  name = "";
  store.del("name");
  render();
  $("nm").focus();
};

if (name) register();

onSnapshot(
  doc(db, "live", "state"),
  { includeMetadataChanges: true },
  (s) => {
    net(s.metadata.fromCache);
    const next = s.data() || { phase: "lobby" };
    if (next.phase === "question")
      estimateClock(next.startedAt, s.metadata.hasPendingWrites);
    st = next;
    render();
  },
  () => net(true),
);

render();

/* ---------- حفظ الإجابات محلياً (عشان التحديث ما يضيّعها) ---------- */
const mine = (q) => {
  const v = store.get("a:" + q);
  return v == null ? null : +v;
};
const failed = (q) => store.get("f:" + q) === "1";

function leftMs() {
  const t0 = st.startedAt?.toMillis?.();
  if (!t0) return st.duration * 1000;
  return Math.max(0, st.duration * 1000 - (clock.now() - t0));
}

/* ---------- العرض ---------- */
function render() {
  clearInterval(tick);
  $("who").textContent = name;
  if (!name) return show("join");
  switch (st.phase) {
    case "question":
      return question();
    case "results":
      return results();
    case "board":
    case "final":
      return board();
    default:
      return lobby();
  }
}

function lobby() {
  builtQ = null;
  $("wt").textContent = `أهلاً ${name} 👋`;
  $("wm").textContent =
    "أنت جاهز! المسابقة رح تبدأ بعد شوي، خليك قريب من الشاشة";
  show("wait");
}

function question() {
  const q = st.qid;
  if (builtQ !== q) {
    builtQ = q;
    $("qn").textContent = `السؤال ${st.idx + 1} من ${st.total}`;
    $("qt").textContent = st.text;
    const op = $("op");
    op.replaceChildren();
    (st.options || []).forEach((t, i) => {
      const b = el("button", "opt");
      b.type = "button";
      b.append(el("span", "let", LETTERS[i]), el("span", "txt", t));
      b.onclick = () => pick(i);
      op.append(b);
    });
  }
  show("q");
  const run = () => {
    const left = leftMs(),
      D = st.duration * 1000;
    timer.set(left, D);
    $("br").style.transform = `scaleX(${D ? left / D : 0})`;
    paint(left <= 0);
    if (left <= 0) clearInterval(tick);
  };
  run();
  if (st.startedAt) tick = setInterval(run, 100);
}

function paint(closed) {
  const q = st.qid,
    a = mine(q),
    f = failed(q),
    op = $("op");
  op.classList.toggle("locked", a != null);
  op.classList.toggle("closed", closed);
  [...op.children].forEach((b, i) => {
    b.classList.toggle("sel", a === i);
    b.disabled = a != null || closed;
  });
  const m = $("msg");
  m.classList.toggle("err", f);
  m.textContent = f
    ? "الوقت خلص قبل ما توصل إجابتك 😕"
    : a != null
      ? "تم تسجيل إجابتك ✓ بانتظار انتهاء الوقت"
      : closed
        ? "انتهى الوقت ⏳"
        : "";
}

async function pick(i) {
  const q = st.qid;
  if (mine(q) != null || leftMs() <= 0) return;
  store.set("a:" + q, i);
  navigator.vibrate?.(30);
  paint(false);
  try {
    await setDoc(doc(db, "answers", q + "_" + pid), {
      u: pid,
      n: name,
      c: i,
      q,
      t: serverTimestamp(),
    });
  } catch {
    store.set("f:" + q, "1");
    if (st.qid === q) paint(leftMs() <= 0);
  }
}

function optionNode(i) {
  const o = el("div", "opt");
  o.style.setProperty("--c", `var(--o${i})`);
  o.style.setProperty("--t", `var(--t${i})`);
  o.append(el("span", "let", LETTERS[i]), el("span", "txt", st.options[i]));
  return o;
}

function results() {
  builtQ = null;
  const q = st.qid,
    a = mine(q),
    f = failed(q);
  const ok = a === st.correct && !f;
  const me = (st.board || []).find((x) => x.u === pid);
  const icon = $("rIcon");
  icon.className = "verdict " + (ok ? "ok" : a != null ? "no" : "none");
  icon.textContent = ok ? "✓" : a != null ? "✗" : "⏳";
  $("rh").textContent = ok
    ? "إجابة صحيحة! 🎉"
    : a != null
      ? f
        ? "وصلت إجابتك متأخرة"
        : "إجابة خاطئة"
      : "ما لحقت تجاوب";
  $("rp").textContent = ok && me?.d ? `+${me.d}` : "";
  $("rc").replaceChildren(optionNode(st.correct));
  const mineP = $("rMine");
  mineP.hidden = !(a != null && a !== st.correct);
  if (!mineP.hidden) mineP.textContent = `إجابتك كانت: ${st.options[a]}`;
  show("res");
  if (ok) navigator.vibrate?.([40, 60, 40]);
}

function board() {
  builtQ = null;
  const fin = st.phase === "final",
    L = st.board || [];
  const i = L.findIndex((x) => x.u === pid),
    m = L[i];
  $("bChip").textContent = fin
    ? "انتهت المسابقة"
    : `بعد السؤال ${st.idx + 1} من ${st.total}`;
  $("bh").textContent = fin
    ? i > -1 && i < 3
      ? "مبروك! أنت من الأوائل 🏆"
      : "النتيجة النهائية"
    : "الترتيب الحالي";

  const me = $("me");
  me.replaceChildren();
  const stat = (v, label, cls = "") => {
    const d = el("div");
    d.append(el("b", cls, v), el("small", "", label));
    me.append(d);
  };
  if (m) {
    stat("#" + (i + 1), "ترتيبك");
    stat(m.s.toLocaleString("en"), "نقاطك");
    if (!fin) stat("+" + (m.d || 0), "هالسؤال", "plus");
  } else me.append(el("small", "", "جاهز للسؤال الجاي 💪"));

  podium($("podium"), L, pid);
  rows($("ls"), L, { meId: pid, limit: fin ? 17 : 7 });
  show("bd");

  if (fin && celebrated !== st.run) {
    celebrated = store.set("cel", st.run || "1");
    confetti(i > -1 && i < 3 ? 7000 : 4000);
  }
}
