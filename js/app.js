// しばまるの こくごたんけん — 画面描画とイベント
import {
  checkOrder, isUnlocked, completeStage, skipTutorial, analyzeTutorial, loadProgress, saveProgress, normalize,
  questionChips, fullPick, sameSet, MISSIONS, subCount, helpFocus,
} from './logic.js';
import { STAGES, TUTORIAL, COMPANIONS } from './stages.js';

const app = document.getElementById('app');
const bubble = document.getElementById('mascot-bubble');
const mascot = document.getElementById('mascot');
const fxLayer = document.getElementById('fx');
const soundBtn = document.getElementById('sound');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let store = null;
try { store = window.localStorage; } catch { store = null; }

const S = {
  screen: 'title', grade: null, progress: null,
  tut: null, st: null, reward: null, resetArmed: false,
};

// ---------- 小道具 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isG1 = () => S.grade === 1;
const t = (g1, g3) => (isG1() ? g1 : g3);
const ids = () => ['tutorial', ...STAGES[S.grade].map((s) => s.id)];
const $ = (sel) => app.querySelector(sel);
const on = (sel, fn) => app.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => fn(el, e)));

function say(html) {
  if (bubble.innerHTML === html) return;
  bubble.innerHTML = html;
  bubble.classList.remove('say'); void bubble.offsetWidth; bubble.classList.add('say');
}
function hop() {
  if (reduceMotion) return;
  mascot.classList.remove('jump'); void mascot.offsetWidth; mascot.classList.add('jump');
  setTimeout(() => mascot.classList.remove('jump'), 750);
}

// ---------- 効果音（WebAudio・ミュート可） ----------
let soundOn = true;
try { soundOn = store?.getItem('shibamaru:sound') !== 'off'; } catch { /* noop */ }
let ctx = null;
function tone(freq, start, dur, type = 'sine', vol = 0.16) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.05);
}
function sfx(kind) {
  if (!soundOn) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'tap') tone(660, 0, 0.08, 'triangle', 0.08);
    if (kind === 'good') { tone(784, 0, 0.14, 'triangle'); tone(1175, 0.1, 0.22, 'triangle'); }
    if (kind === 'hmm') tone(392, 0, 0.18, 'sine', 0.08);
    if (kind === 'crack') { tone(1568, 0, 0.06, 'square', 0.05); tone(2093, 0.05, 0.12, 'triangle', 0.1); }
    if (kind === 'fanfare') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.14));
  } catch { /* 音が出せない環境では無音 */ }
  if (kind === 'good' || kind === 'fanfare') navigator.vibrate?.(kind === 'fanfare' ? [20, 40, 20] : 15);
}
function paintSound() { soundBtn.setAttribute('aria-pressed', String(soundOn)); soundBtn.textContent = soundOn ? '🔊 おと' : '🔇 おと'; }
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn; paintSound();
  try { store?.setItem('shibamaru:sound', soundOn ? 'on' : 'off'); } catch { /* noop */ }
  sfx('tap');
});
paintSound();

// ---------- 読み上げ ----------
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\n/g, '。'));
  u.lang = 'ja-JP'; u.rate = isG1() ? 0.85 : 0.95;
  speechSynthesis.speak(u);
}
const canSpeak = 'speechSynthesis' in window;
const readBtn = (label = '🔈 よんでもらう') => (canSpeak ? `<button type="button" class="read-btn" data-read>${label}</button>` : '');

// ---------- 演出 ----------
function confetti(n = 40) {
  if (reduceMotion) return;
  const colors = ['#f57b45', '#ffd08a', '#7ac8ab', '#b9e7db', '#ffe7a1', '#f2a58e', '#5fae8b'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`);
    c.style.setProperty('--r', `${360 + Math.random() * 720}deg`);
    c.style.setProperty('--d', `${1.3 + Math.random() * 1.1}s`);
    c.style.animationDelay = `${Math.random() * 0.25}s`;
    fxLayer.appendChild(c);
    setTimeout(() => c.remove(), 2800);
  }
}
function burst(text, el) {
  if (reduceMotion || !el) return;
  const r = el.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'burst'; b.textContent = text;
  b.style.left = `${r.left + r.width / 2}px`; b.style.top = `${r.top + r.height / 2}px`;
  fxLayer.appendChild(b); setTimeout(() => b.remove(), 950);
}

// ---------- 画面遷移 ----------
function go(screen, opts = {}) {
  S.screen = screen;
  if (opts.push !== false && screen !== 'title') history.pushState({ screen }, '');
  render();
  if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}
window.addEventListener('popstate', () => {
  if (S.screen === 'map' || !S.grade) { S.screen = 'title'; render(); return; }
  S.screen = 'map'; render();
});
document.getElementById('brand').addEventListener('click', () => { S.screen = 'title'; render(); window.scrollTo({ top: 0 }); });

function save() { saveProgress(store, S.grade, S.progress); }

function render() {
  document.body.className = `screen-${S.screen}`;
  app.classList.toggle('g3', S.grade === 3);
  app.classList.toggle('g1', S.grade === 1);
  if (canSpeak) speechSynthesis.cancel();
  ({ title: renderTitle, map: renderMap, tutorial: renderTutorial, stage: renderStage, reward: renderReward, friends: renderFriends, parent: renderParent })[S.screen]();
  on('[data-read]', () => speak(currentReadText()));
}
function currentReadText() {
  if (S.screen === 'tutorial') { const q = TUTORIAL[S.grade]; return `${q.story}\n${q.question}`; }
  if (S.screen === 'stage') { const s = S.st.stage; return `${s.passage.join('\n')}\n${s.question}`; }
  return '';
}

// ---------- タイトル（学年をえらぶと そのままマップへ） ----------
function gradeSummary(g) {
  const p = loadProgress(store, g);
  const friends = STAGES[g].filter((s) => p.cleared.includes(s.id)).length;
  if (!p.cleared.length) return 'はじめから';
  return `なかま ${friends}/6`;
}
function renderTitle() {
  say('ぼくは しばまる！<br>いっしょに やってみよ 🐾');
  app.innerHTML = `
    <div class="eyebrow">KOKUGO ADVENTURE</div>
    <h1>こくごの「なぜ？」を<br><span class="accent">みつけよう！</span></h1>
    <p class="lead">さいしょに れんしゅう、そのあと 6つの ステージに ちょうせん！</p>
    <div class="mini-tags"><span class="mini-tag">🐾 1日1ステージ・5ふん</span><span class="mini-tag">🎁 なかまを あつめる</span><span class="mini-tag">✏️ かみと えんぴつ</span></div>
    <span class="field-label">だれが あそぶ？</span>
    <div class="grade-row">
      <button type="button" class="grade-btn" data-grade="1"><span class="g-icon" aria-hidden="true">🌱</span>1ねんせい<small>ぜんぶ ひらがな</small><span class="g-prog">${gradeSummary(1)}</span></button>
      <button type="button" class="grade-btn" data-grade="3"><span class="g-icon" aria-hidden="true">⭐</span>3年生<small>漢字まじり</small><span class="g-prog">${gradeSummary(3)}</span></button>
    </div>
    <p class="muted" style="margin:12px 0 0">※おうちの人が そばで みまもってね。きろくは この スマホの なかだけに のこります。</p>`;
  on('[data-grade]', (b) => {
    sfx('tap');
    S.grade = Number(b.dataset.grade);
    S.progress = loadProgress(store, S.grade);
    go('map');
  });
}

// ---------- ぼうけんマップ ----------
function nextIndex() {
  const list = ids();
  const i = list.findIndex((id) => !S.progress.cleared.includes(id));
  return i === -1 ? null : i;
}
function renderMap() {
  const list = ids();
  const next = nextIndex();
  const friends = STAGES[S.grade].filter((s) => S.progress.cleared.includes(s.id)).length;
  say(next === 0 ? t('まずは れんしゅうから！<br>いっしょに やろう 🐾', 'まずは練習から！<br>いっしょにやろう 🐾')
    : next === null ? t('ぜんぶ クリア！<br>すごいよ〜！ 🎉', '全部クリア！<br>本物のたんけん家だ 🎉')
      : t('つぎの ばしょへ<br>しゅっぱつ！ 🐾', '次の場所へ<br>出発しよう！ 🐾'));
  const stages = [{ id: 'tutorial', place: t('しばまるの いえ', 'しばまるの家'), title: 'チュートリアル', skill: { icon: '🐾' } }, ...STAGES[S.grade]];
  const nodes = stages.map((s, i) => {
    const cleared = S.progress.cleared.includes(s.id);
    const open = isUnlocked(S.progress, list, i);
    const cls = cleared ? 'cleared' : open ? 'current' : 'locked';
    const label = i === 0 ? s.place : `${i}. ${s.place}`;
    return `<li>${cls === 'current' ? '<span class="here">いまここ</span>' : ''}
      <button type="button" class="node ${cls}" data-idx="${i}" ${open ? '' : 'disabled'} aria-label="${esc(label)} ${esc(s.title)}${cleared ? '（クリア）' : open ? '' : '（まだ ひらいていない）'}">
        <span class="dot" aria-hidden="true">${open ? s.skill.icon : '🔒'}</span>
        <span class="t"><small>${esc(label)}</small><b>${open ? esc(s.title) : '？？？'}</b></span>
      </button></li>`;
  }).join('');
  const ctaLabel = next === null ? t('すきな ステージを えらんでね', '好きなステージを選んでね')
    : next === 0 ? 'チュートリアルを はじめる →' : `ステージ${next}へ しゅっぱつ →`;
  app.innerHTML = `
    <div class="map-head">
      <h2 style="margin:0">${t('🌱 1ねんせいの ぼうけん', '⭐ 3年生のぼうけん')}</h2>
      <span class="chip">🎁 なかま ${friends}/6</span>
    </div>
    <nav class="map" aria-label="ぼうけんマップ"><ol>${nodes}</ol></nav>
    <div class="map-links">
      <button type="button" class="secondary" id="friends">🐾 なかま ずかん</button>
      <button type="button" class="secondary" id="parent">👪 おうちの人へ</button>
    </div>
    <div class="cta-bar"><button type="button" class="primary" id="go" ${next === null ? 'disabled' : ''}>${ctaLabel}</button>
      ${next === 0 ? `<button type="button" class="skip-btn" id="skip">${t('チュートリアルを とばして ステージ1へ', 'チュートリアルをとばしてステージ1へ')}</button>` : ''}</div>`;
  on('[data-idx]', (b) => startStage(Number(b.dataset.idx)));
  $('#go').addEventListener('click', () => next !== null && startStage(next));
  $('#skip')?.addEventListener('click', () => { S.progress = skipTutorial(S.progress); save(); startStage(1); });
  $('#friends').addEventListener('click', () => { sfx('tap'); go('friends'); });
  $('#parent').addEventListener('click', () => { sfx('tap'); S.resetArmed = false; go('parent'); });
}
function startStage(i) {
  sfx('tap');
  if (i === 0) { S.tut = { step: 1, intent: null, oral: null, start: null, written: null, note: '' }; go('tutorial'); return; }
  const stage = STAGES[S.grade][i - 1];
  S.st = {
    stage, index: i, mission: 1, sub: 0, tried: [], solved: false, hint: 0, hintsUsed: 0, hintsBy: { decode: 0, evidence: 0, build: 0, check: 0 },
    picked: [], selected: [], checked: [], showModel: false, paper: null, order: null,
  };
  prepareOrder();
  go('stage');
}

// ---------- チュートリアル（元の1問チェック＋操作説明） ----------
function stepHeader(num, total, title, caption, pill) {
  return `<div class="progress-top"><button type="button" class="back" id="back">← マップ</button><span class="step-pill">${pill} ${num} / ${total}</span></div>
    <div class="track" aria-label="すすみぐあい ${num}/${total}">${Array.from({ length: total }, (_, k) => `<span class="${k + 1 < num ? 'done' : k + 1 === num ? 'current' : ''}"></span>`).join('')}</div>
    <h2>${title}</h2>${caption ? `<p class="helper">${caption}</p>` : ''}`;
}
function choiceButtons(name, items, value) {
  return `<div class="choices3" role="group" aria-label="${name}">${items.map(([v, label]) => `<button type="button" class="${v === value ? 'selected' : ''}" data-field="${name}" data-value="${v}" aria-pressed="${v === value}">${esc(label)}</button>`).join('')}</div>`;
}
function bindTutChoices() {
  on('[data-field]', (b) => { sfx('tap'); const n = $('#note'); if (n) S.tut.note = n.value; S.tut[b.dataset.field] = b.dataset.value; render(); });
}
function renderTutorial() {
  const T = S.tut; const q = TUTORIAL[S.grade];
  const passage = `<div class="story-wrap"><p class="story">${esc(q.story)}</p>${readBtn()}</div><div class="question">${esc(q.question)}</div>`;
  const pill = 'チュートリアル';
  if (T.step === 1) {
    say(t('もんだいを よんで、<br>なにを きかれたか さがそう！', '問題を読んで、<br>何を聞かれたか探そう！'));
    app.innerHTML = stepHeader(1, 4, 'もんだいの ひみつを さがせ！', '', pill)
      + passage
      + `<div class="ask">この もんだいで きかれて いるのは？</div>
      <div class="options">${q.choices.map((x, i) => `<button type="button" class="option ${i === T.intent ? 'selected' : ''}" data-intent="${i}" aria-pressed="${i === T.intent}">${esc(x)}</button>`).join('')}</div>
      <p class="tiny-rule">※こたえあわせは さいごに するよ。</p>
      <div class="cta-bar"><button type="button" class="primary" id="next" ${T.intent === null ? 'disabled' : ''}>つぎへ すすむ →</button></div>`;
    on('[data-intent]', (b) => { sfx('tap'); T.intent = Number(b.dataset.intent); render(); });
    $('#next').addEventListener('click', () => { sfx('tap'); T.step = 2; go('tutorial', { push: false }); });
  } else if (T.step === 2) {
    say(t('つぎは こえに だして<br>こたえてみよう！', '次は声に出して<br>答えてみよう！'));
    app.innerHTML = stepHeader(2, 4, 'おくちで こたえてみよう！', t('まだ かかなくて いいよ。', 'まだ書かなくていいよ。'), pill)
      + passage
      + `<div class="parent-box"><strong>👪 おうちの人がタップ</strong><p>まずヒントなしで。むずかしければ「どこに書いてあるかな？」と声かけを。</p></div>
      <div class="group-label">口で答えられた？</div>
      ${choiceButtons('oral', [['yes', '😊 ひとりで答えられた'], ['hint', '💡 ヒントがあれば答えられた'], ['no', '🤔 答えられなかった']], T.oral)}
      <div class="cta-bar"><button type="button" class="primary" id="next" ${!T.oral ? 'disabled' : ''}>かく ミッションへ →</button></div>`;
    bindTutChoices();
    $('#next').addEventListener('click', () => { sfx('tap'); T.step = 3; go('tutorial', { push: false }); });
  } else if (T.step === 3) {
    say(t('さいごは かみに かいてみよ！<br>みじかくて いいよ ✏️', '最後は紙に書いてみよ！<br>短くていいよ ✏️'));
    app.innerHTML = stepHeader(3, 4, 'かみと えんぴつの ミッション！', '', pill)
      + passage
      + `<div class="writing-visual"><span class="pencil" aria-hidden="true">✏️</span><span>${t('いま いった こたえを、かみに 1ぶんで かこう。', 'いま言った答えを、紙に1文で書こう。')}</span></div>
      <div class="parent-box"><strong>👪 おうちの人がタップ</strong><p>字のきれいさより、書き始められたか・意味が通じるかを見てね。嫌がったら無理しなくてOK。</p></div>
      <div class="group-label">① 書き始める様子は？</div>
      ${choiceButtons('start', [['quick', '😊 自分から書き始めた'], ['prompt', '💬 声かけ後に書き始めた'], ['avoid', '😣 嫌がった・書き始められなかった']], T.start)}
      <div class="group-label">② 書いた答えは？</div>
      ${choiceButtons('written', [['yes', '✅ 理由が伝わる文になった'], ['partial', '📝 少し書いたが、文が不十分'], ['no', '➖ 書けなかった']], T.written)}
      <label for="note" class="group-label" style="display:block">ひとことメモ（任意）</label>
      <textarea id="note" placeholder="例：口ではすぐ言えたが、鉛筆を持つまで時間がかかった">${esc(T.note)}</textarea>
      <div class="cta-bar"><button type="button" class="primary" id="next" ${!(T.start && T.written) ? 'disabled' : ''}>けっかを みる ✨</button></div>`;
    bindTutChoices();
    $('#note').addEventListener('input', (e) => { T.note = e.target.value; });
    $('#next').addEventListener('click', () => { sfx('good'); T.step = 4; go('tutorial', { push: false }); });
  } else {
    say(t('やった〜！ さいごまで<br>たんけん できたね！ 🐾', 'やった〜！ 最後まで<br>たんけんできたね！ 🐾'));
    hop();
    const a = analyzeTutorial(T);
    app.innerHTML = stepHeader(4, 4, 'チュートリアル クリア！', 'ここは おうちの人が いっしょに みてね。', pill)
      + `<div class="result-box"><div class="result-head">🐾 ${esc(a.title)}</div><p>${esc(a.text)}</p></div>
      ${tutorialGrid(T)}
      <div class="answer-sample"><strong>答えの例</strong><br>${esc(q.example)}</div>
      <p class="tiny-rule">※1問だけの観察です。学力や発達の診断ではありません。記録は「おうちの人へ」で見られます。</p>
      <div class="cta-bar"><button type="button" class="primary" id="next">🎁 たからばこを あける</button></div>`;
    $('#next').addEventListener('click', () => {
      S.progress = completeStage(S.progress, 'tutorial', { hints: 0, paper: T.start, written: T.written });
      S.progress.tutorial = { intent: T.intent, oral: T.oral, start: T.start, written: T.written, note: T.note, date: new Date().toISOString().slice(0, 10) };
      save();
      S.reward = { kind: 'tutorial', opened: false };
      go('reward', { push: false });
    });
  }
  $('#back').addEventListener('click', () => { sfx('tap'); go('map'); });
}
const TUT_LABEL = {
  oral: { yes: 'ひとりで答えられた', hint: 'ヒントで答えられた', no: '答えられなかった' },
  start: { quick: '自分から書き始めた', prompt: '声かけで書き始めた', avoid: '書き始められなかった' },
  written: { yes: '理由が伝わる文', partial: '文が不十分', no: '書けなかった' },
};
function tutorialGrid(T) {
  return `<div class="result-grid">
    <div class="result-item"><span>🔎 問いの理解</span><strong>${T.intent === 1 ? '理由の問題とわかった' : '問いの読み取りを練習'}</strong></div>
    <div class="result-item"><span>🗣️ 口で答える</span><strong>${esc(TUT_LABEL.oral[T.oral])}</strong></div>
    <div class="result-item"><span>✏️ 書き始める</span><strong>${esc(TUT_LABEL.start[T.start])}</strong></div>
    <div class="result-item"><span>📃 紙の答え</span><strong>${esc(TUT_LABEL.written[T.written])}</strong></div>
  </div>`;
}

// ---------- 本番ステージ（5ミッション：ひみつ → てがかり → くみたて → チェック → かみ） ----------
const kindOf = (st) => MISSIONS[st.mission - 1];
function prepareOrder() {
  const st = S.st; const s = st.stage; const kind = kindOf(st);
  st.order = null;
  if (kind === 'decode' && s.grade === 1 && st.sub === 1) st.order = shuffle(s.shape.choices.length);
  if (kind === 'decode' && s.grade === 3) st.order = shuffle(s.conds.choices.length);
  if (kind === 'build') st.order = shuffle(s.build.type === 'cards' ? s.build.cards.length : s.build.choices.length);
  if (kind === 'check' && s.grade === 3) st.order = shuffle(s.review.length);
}
function nextMission() {
  const st = S.st;
  if (st.sub < subCount(st.stage, kindOf(st)) - 1) st.sub += 1;
  else { st.mission += 1; st.sub = 0; }
  Object.assign(st, { tried: [], solved: false, hint: 0, picked: [], selected: [] });
  prepareOrder();
  sfx('tap');
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}
function countHelp() {
  const st = S.st;
  st.hintsUsed += 1;
  st.hintsBy[kindOf(st)] = (st.hintsBy[kindOf(st)] ?? 0) + 1;
}
function missed() {
  const st = S.st;
  sfx('hmm');
  if (st.hint < 3) { st.hint += 1; countHelp(); }
}
// まちがえたら ヒントを出して、下のボタンに かくれないよう 見える位置へ
function miss() {
  missed(); render();
  $('.feedback.hint')?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}
function hintList() {
  const st = S.st; const s = st.stage; const kind = kindOf(st);
  if (kind === 'decode' && s.grade === 1 && st.sub === 1) return s.shape.hints;
  return s.hints[kind];
}
function hintBox() {
  const st = S.st;
  if (st.solved) return '';
  const hints = hintList();
  const shown = st.hint > 0 ? `<div class="feedback hint" role="status"><span class="ico" aria-hidden="true">💡</span><span>${st.tried.length ? 'おしい！ ' : ''}${esc(hints[st.hint - 1])}</span></div>` : '';
  const more = st.hint < 3 ? `<button type="button" class="hint-btn" id="hint">💡 ヒント${st.hint ? 'を もっと' : ''}（${st.hint}/3）</button>` : '';
  return shown + more;
}
function bindHint() {
  const b = $('#hint');
  if (b) b.addEventListener('click', () => { S.st.hint += 1; countHelp(); sfx('tap'); render(); });
}
function highlightQuestion(s) {
  // 1年は問いのことば（qword）だけ、3年は条件のことばに下線マーカー
  if (s.grade === 1) return esc(s.question).replace(esc(s.qword), `<mark>${esc(s.qword)}</mark>`);
  return esc(s.question).replace(/(なぜ|何と|どのように|どんな気持ち|前の日の夜|「〜な気持ち。」の形|書きぬき|本文から|五字|十五字以内|本文の言葉を使って|「それ」)/g, '<mark>$1</mark>');
}
function renderStage() {
  const st = S.st;
  const names = {
    decode: t('もんだいの ひみつ', '問題文を解読'), evidence: t('てがかり さがし', '手がかりさがし'), build: t('こたえ くみたて', '答えを組み立て'),
    check: t('なかまの こたえ、あってる？', '先生になって丸つけ'), paper: t('かみに かこう', '紙に書こう'),
  };
  const total = MISSIONS.length;
  const head = `<div class="progress-top"><button type="button" class="back" id="back">← マップ</button><span class="step-pill">ステージ${st.index} ・ ${st.mission} / ${total}</span></div>
    <div class="track" aria-label="すすみぐあい ${st.mission}/${total}">${MISSIONS.map((_, k) => `<span class="${k + 1 < st.mission ? 'done' : k + 1 === st.mission ? 'current' : ''}"></span>`).join('')}</div>`;
  const kind = kindOf(st);
  const subs = subCount(st.stage, kind);
  const title = `<h2>${esc(names[kind])}${subs > 1 ? ` <small class="sub-no">${st.sub + 1}/${subs}</small>` : ''}</h2>`;
  const body = { decode: missionDecode, evidence: missionEvidence, build: missionBuild, check: missionCheck, paper: missionPaper }[kind]();
  app.innerHTML = head + title + body;
  $('#back').addEventListener('click', () => { sfx('tap'); go('map'); });
  bindHint();
  bindMission();
}
function storyBlock() {
  const s = S.st.stage;
  return `<div class="story-wrap"><p class="story">${esc(s.passage.join('\n'))}</p>${readBtn()}</div>`;
}
const nextBar = (label) => `<div class="cta-bar"><button type="button" class="primary" id="next" ${S.st.solved ? '' : 'disabled'}>${S.st.solved ? 'つぎへ →' : label}</button></div>`;
const goodBox = (ico, html) => `<div class="feedback good" role="status"><span class="ico" aria-hidden="true">${ico}</span><span>${html}</span></div>`;

function missionDecode() {
  const st = S.st; const s = st.stage;
  if (s.grade === 1 && st.sub === 0) {
    // ① 問いの中の「きいて いる ことば」をタップ
    say(st.solved ? 'みつけた！<br>それが ひみつの ことば ✨' : 'もんだいの なかの<br>きいて いる ことばは？ 🔎');
    const chips = questionChips(s.question, s.qword).map((c, i) => {
      const cls = st.solved && c.key ? 'found' : st.tried.includes(i) ? 'nope' : '';
      return `<button type="button" class="qchip ${cls}" data-chip="${i}" ${c.key ? 'data-key="1"' : ''} ${st.solved || st.tried.includes(i) ? 'disabled' : ''}>${esc(c.text)}</button>`;
    }).join('');
    return `<div class="ask">👆 きいて いる ことばを タップ</div>
      <div class="qchips" aria-label="もんだいの ことば">${chips}</div>
      ${st.solved ? goodBox('⭕', `「${esc(s.qword)}」が きいて いる ことばだね。`) : hintBox()}
      <div class="group-label">📖 おはなし</div>
      ${storyBlock()}
      ${nextBar('ことばを タップしてね')}`;
  }
  if (s.grade === 1) {
    // ② こたえの かたち（問いのことば → こたえの おわり）
    say(st.solved ? 'せいかい！<br>こたえの かたちが わかったね ✨' : `「${esc(s.qword)}」と きかれたら<br>なにを こたえる？ 🤔`);
    const opts = st.order.map((i) => {
      const cls = st.solved && i === s.shape.answer ? 'correct' : st.tried.includes(i) ? 'nope' : '';
      return `<button type="button" class="option ${cls}" data-pick="${i}" ${st.solved || st.tried.includes(i) ? 'disabled' : ''}>${esc(s.shape.choices[i])}</button>`;
    }).join('');
    return `<div class="question">${highlightQuestion(s)}</div>
      <div class="ask">こたえは どんな ことば？</div>
      <div class="options">${opts}</div>
      ${st.solved ? goodBox('⭕', esc(s.shape.tip)) : hintBox()}
      ${nextBar('こたえを えらんでね')}`;
  }
  // 3年：条件を ぜんぶ えらぶ
  say(st.solved ? '解読成功！<br>条件が全部そろった ✨' : '問題文の条件を<br>全部見つけよう！ 🔎');
  const c = s.conds;
  const opts = st.order.map((i) => {
    const on = st.selected.includes(i);
    const cls = st.solved ? (c.answers.includes(i) ? 'correct' : 'off') : on ? 'selected' : '';
    return `<button type="button" class="option multi ${cls}" data-cond="${i}" aria-pressed="${on}" ${st.solved ? 'disabled' : ''}>${esc(c.choices[i])}</button>`;
  }).join('');
  return `<div class="question">${st.solved ? highlightQuestion(s) : esc(s.question)}</div>
    <div class="ask">条件を、全部選ぼう <span class="chip">${st.solved ? `${c.answers.length}つ` : 'いくつ？'}</span></div>
    <div class="options">${opts}</div>
    ${st.solved ? goodBox('⭕', esc(c.tip)) : hintBox()}
    <div class="group-label">📖 本文</div>
    ${storyBlock()}
    ${st.solved ? nextBar('') : `<div class="cta-bar"><button type="button" class="primary" id="check" ${st.selected.length ? '' : 'disabled'}>これで決定！</button></div>`}`;
}
function missionEvidence() {
  const st = S.st; const s = st.stage;
  say(st.solved ? t('バリアが われた！<br>てがかり はっけん ✨', 'バリアが割れた！<br>手がかり発見 ✨') : t('こたえが かいて ある<br>ぶんを タップ！ 👆', '答えの根拠になる<br>文をタップ！ 👆'));
  const sents = s.passage.map((p, i) => {
    const cls = st.solved && s.evidence.includes(i) ? 'found' : st.tried.includes(i) ? 'nope' : '';
    return `<button type="button" class="sent ${cls}" data-sent="${i}" ${st.solved ? 'disabled' : ''}><span class="no" aria-hidden="true">${i + 1}</span><span class="txt">${esc(p)}</span></button>`;
  }).join('');
  return `<div class="question">${highlightQuestion(s)}</div>
    <div class="barrier ${st.solved ? 'broken' : ''}" id="barrier">${st.solved ? '✨ パリン！ みつけた！' : t('🛡️ こたえが ある ぶんを タップ', '🛡️ 答えがある文をタップ')}</div>
    <div class="sentences">${sents}</div>
    ${readBtn()}
    ${st.solved ? goodBox('✏️', t('かみの もんだいでも、ここに せんを ひこう。', '紙の問題でも、ここに線を引こう。')) : hintBox()}
    ${nextBar(t('ぶんを タップしてね', '文をタップしてね'))}`;
}
function missionBuild() {
  const st = S.st; const s = st.stage; const b = s.build;
  say(st.solved ? t('といと こたえを<br>つなげて よもう！ 🗣️', '声に出して<br>読んでみよう！ 🗣️') : t('こたえを<br>くみたてよう！ 🧩', '答えを<br>組み立てよう！ 🧩'));
  let ui = '';
  if (b.type === 'cards') {
    const endIdx = b.fixedEnd ? b.answer[b.answer.length - 1] : -1;
    const slots = st.picked.map((i, k) => `<button type="button" class="card" data-unpick="${k}" ${st.solved ? 'disabled' : ''}>${esc(b.cards[i])}</button>`).join('')
      + (endIdx >= 0 ? `<span class="card fixed" aria-label="さいごの カード（はじめから おいて あるよ）">${esc(b.cards[endIdx])}</span>` : '');
    const pool = st.order.filter((i) => i !== endIdx).map((i) => `<button type="button" class="card ${st.picked.includes(i) ? 'used' : ''}" data-card="${i}" ${st.picked.includes(i) || st.solved ? 'disabled tabindex="-1"' : ''}>${esc(b.cards[i])}</button>`).join('');
    ui = `<div class="slots ${st.solved ? 'ok' : ''} ${st.picked.length ? '' : 'waiting'}" aria-label="くみたてた こたえ">${slots}</div>
      ${st.solved ? '' : `<div class="pool">${pool}</div>`}`;
  } else {
    ui = `<div class="options">${st.order.map((i) => {
      const cls = st.solved && i === b.answer ? 'correct' : st.tried.includes(i) ? 'nope' : '';
      return `<button type="button" class="option ${cls}" data-choice="${i}" ${st.solved || st.tried.includes(i) ? 'disabled' : ''}>${esc(b.choices[i])}</button>`;
    }).join('')}</div>`;
  }
  const cond = s.maxChars ? `<span class="chip">📏 ${s.maxChars}字${s.extract ? '' : '以内'}</span>` : '';
  const ready = b.type === 'cards' && !st.solved && st.picked.length > 0;
  // 1年：とい と こたえを つなげて よむ（耳で「あってる」を感じる）
  const solvedBox = s.grade === 1
    ? `<div class="pair" role="status"><div class="pair-q"><span class="pair-tag">とい</span>${highlightQuestion(s)}</div><div class="pair-a"><span class="pair-tag">こたえ</span>${esc(s.exampleAnswer)}</div>${canSpeak ? '<button type="button" class="read-btn" id="pair-read">🔈 つなげて よむ</button>' : ''}</div>`
    : goodBox('🗣️', `できた！ 声に出して読んでみよう。<br><b>「${esc(s.exampleAnswer)}」</b>`);
  return `${cond ? `<p class="helper">${cond}</p>` : ''}
    <div class="question">${highlightQuestion(s)}</div>
    ${ui}
    ${st.solved ? solvedBox : hintBox()}
    <div class="cta-bar">${st.solved ? `<button type="button" class="primary" id="next">つぎへ →</button>`
      : b.type === 'cards' ? `<div class="row"><button type="button" class="secondary" id="clear" ${st.picked.length ? '' : 'disabled'}>↺ やりなおす</button><button type="button" class="primary" id="check" ${ready ? '' : 'disabled'}>これで OK！</button></div>`
        : `<button type="button" class="primary" disabled>${t('こたえを えらんでね', '答えを選んでね')}</button>`}</div>`;
}
const pairText = (s) => `${s.question}\n${s.exampleAnswer}`;
function missionCheck() {
  const st = S.st; const s = st.stage;
  if (s.grade === 1) {
    // なかまが「本文の写し」で こたえた。あってる？ ちがう？
    const j = s.judge[st.sub];
    const f = COMPANIONS[1][(st.index - 1 + st.sub) % 6];
    say(st.solved ? (j.ok ? 'そう！<br>あってるね ⭕' : 'そう！<br>こたえに なって ないね ❌') : `${esc(f.name.split(' ').pop())}が かいたよ。<br>あってるかな？ 🧐`);
    const btn = (v, label) => {
      const right = (v === 1) === j.ok;
      const cls = st.solved && right ? 'correct' : st.tried.includes(v) ? 'nope' : '';
      return `<button type="button" class="judge-btn ${v ? 'ok' : 'ng'} ${cls}" data-judge="${v}" ${st.solved || st.tried.includes(v) ? 'disabled' : ''}>${label}</button>`;
    };
    return `<div class="question">${highlightQuestion(s)}</div>
      <div class="friend-answer"><span class="who"><span aria-hidden="true">${f.emoji}</span> ${esc(f.name)}の こたえ</span><p>${esc(j.text)}</p></div>
      <div class="ask">この こたえ、あってる？</div>
      <div class="judge-row">${btn(1, '⭕ あってる')}${btn(0, '❌ ちがう')}</div>
      ${st.solved ? goodBox(j.ok ? '⭕' : '❌', esc(j.why)) : st.tried.length ? `<div class="feedback hint" role="status"><span class="ico" aria-hidden="true">💡</span><span>おしい！ ${esc(j.why)}</span></div>` : ''}
      ${nextBar('⭕か ❌を タップ')}`;
  }
  // 3年：先生になって丸つけ（100点の答えを選ぶ。まちがいを選ぶと、その答えのよくない所が出る）
  say(st.solved ? '丸つけ完了！<br>先生の目だね 💯' : '100点の答えは<br>どれかな？ 🧐');
  const items = st.order.map((i) => {
    const r = s.review[i];
    const showFlaw = !r.ok && (st.solved || st.tried.includes(i));
    const cls = st.solved && r.ok ? 'correct' : showFlaw ? 'nope' : '';
    return `<button type="button" class="option review ${cls}" data-review="${i}" ${st.solved || st.tried.includes(i) ? 'disabled' : ''}><span class="rv"><span class="rv-text">${esc(r.text)}</span>${showFlaw ? `<span class="flaw">✗ ${esc(r.flaw)}</span>` : ''}${st.solved && r.ok ? '<span class="flaw ok">💯 条件を全部みたしている</span>' : ''}</span></button>`;
  }).join('');
  return `<div class="question">${highlightQuestion(s)}</div>
    <div class="ask">100点の答えはどれ？</div>
    <div class="options">${items}</div>
    ${st.solved ? goodBox('✏️', '自分の答えも、書いたあとに条件を1つずつ見直そう。') : ''}
    ${nextBar('答えを選んでね')}`;
}
function missionPaper() {
  const st = S.st; const s = st.stage;
  say(t('かみに かいたら<br>たからばこだよ！ ✏️', '紙に書いたら<br>宝箱だよ！ ✏️'));
  const notebook = `<div class="notebook"><small>✏️ ${t('かみに うつそう', '見本')}</small>${esc(s.exampleAnswer)}</div>`;
  // 3年：見本は見ないで書き、条件で じぶんチェック
  const g3 = s.grade === 3 ? `${st.showModel ? notebook : `<div class="writing-visual"><span class="pencil" aria-hidden="true">✏️</span><span>見本を見ないで、紙に書いてみよう。</span></div><button type="button" class="link-btn" id="model">👀 見本を見る</button>`}
    <div class="group-label">✅ 書けたら じぶんチェック</div>
    <div class="checklist">${s.conds.answers.map((i) => `<button type="button" class="check-item ${st.checked.includes(i) ? 'on' : ''}" data-selfcheck="${i}" aria-pressed="${st.checked.includes(i)}">${esc(s.conds.choices[i])}</button>`).join('')}</div>` : notebook;
  return `<div class="question">${esc(s.question)}</div>
    ${g3}
    <div class="parent-box"><strong>👪 かけたら おうちの人が タップ</strong><p>どれでも宝箱は開きます。</p></div>
    ${choiceButtons('paper', [['self', '😊 自分から書けた'], ['prompt', '💬 声かけで書けた'], ['oral', '🗣️ 今日は口で言えた（書くのはお休み）']], st.paper)}
    <div class="cta-bar"><button type="button" class="primary" id="next" ${st.paper ? '' : 'disabled'}>🎁 たからばこを あける</button></div>`;
}
function solve(el, word = 'せいかい！') {
  S.st.solved = true; sfx('good'); hop(); render(); burst(word, $(el));
}
function bindMission() {
  const st = S.st; const s = st.stage; const kind = kindOf(st);
  const next = $('#next');
  if (kind === 'decode') {
    on('[data-chip]', (b) => {
      if (b.dataset.key) solve('.qchip.found', 'みつけた！');
      else { st.tried.push(Number(b.dataset.chip)); miss(); }
    });
    on('[data-pick]', (b) => {
      const i = Number(b.dataset.pick);
      if (i === s.shape.answer) solve('.option.correct');
      else { st.tried.push(i); miss(); }
    });
    on('[data-cond]', (b) => {
      sfx('tap');
      const i = Number(b.dataset.cond);
      st.selected = st.selected.includes(i) ? st.selected.filter((x) => x !== i) : [...st.selected, i];
      render();
    });
    $('#check')?.addEventListener('click', () => {
      if (sameSet(st.selected, s.conds.answers)) solve('.options', '解読！');
      else { st.tried.push(st.selected.join(',')); miss(); }
    });
  }
  if (kind === 'evidence') {
    on('[data-sent]', (b) => {
      const i = Number(b.dataset.sent);
      if (s.evidence.includes(i)) { st.solved = true; sfx('crack'); setTimeout(() => sfx('good'), 120); hop(); render(); burst('パリン！', $('#barrier')); }
      else { if (!st.tried.includes(i)) st.tried.push(i); miss(); }
    });
  }
  if (kind === 'build') {
    on('[data-card]', (b) => { sfx('tap'); st.picked.push(Number(b.dataset.card)); render(); });
    on('[data-unpick]', (b) => { sfx('tap'); st.picked.splice(Number(b.dataset.unpick), 1); render(); });
    $('#clear')?.addEventListener('click', () => { sfx('tap'); st.picked = []; render(); });
    $('#check')?.addEventListener('click', () => {
      if (checkOrder(fullPick(st.picked, s.build), s.build.answer)) {
        solve('.slots', 'できた！');
        if (s.grade === 1 && soundOn) setTimeout(() => speak(pairText(s)), 500);
      } else { st.tried.push(st.picked.join(',')); st.picked = []; miss(); }
    });
    on('[data-choice]', (b) => {
      const i = Number(b.dataset.choice);
      if (i === s.build.answer) solve('.option.correct', 'できた！');
      else { st.tried.push(i); miss(); }
    });
    $('#pair-read')?.addEventListener('click', () => speak(pairText(s)));
  }
  if (kind === 'check') {
    on('[data-judge]', (b) => {
      const v = Number(b.dataset.judge);
      if ((v === 1) === s.judge[st.sub].ok) solve('.judge-btn.correct', v ? 'まる！' : 'みぬいた！');
      else { st.tried.push(v); miss(); }
    });
    on('[data-review]', (b) => {
      const i = Number(b.dataset.review);
      if (s.review[i].ok) solve('.option.correct', '💯');
      else { st.tried.push(i); miss(); }
    });
  }
  if (kind === 'paper') {
    on('[data-field]', (b) => { sfx('tap'); st.paper = b.dataset.value; render(); });
    $('#model')?.addEventListener('click', () => { sfx('tap'); st.showModel = true; render(); });
    on('[data-selfcheck]', (b) => {
      const i = Number(b.dataset.selfcheck);
      st.checked = st.checked.includes(i) ? st.checked.filter((x) => x !== i) : [...st.checked, i];
      sfx(st.checked.includes(i) ? 'good' : 'tap'); render();
    });
    next?.addEventListener('click', () => {
      const rec = { hints: st.hintsUsed, hintsBy: st.hintsBy, paper: st.paper };
      if (s.grade === 3) Object.assign(rec, { selfCheck: st.checked.length, selfCheckOf: s.conds.answers.length, model: st.showModel });
      S.progress = completeStage(S.progress, s.id, rec);
      save();
      S.reward = { kind: 'stage', index: st.index, opened: false };
      go('reward', { push: false });
    });
    return;
  }
  if (st.solved) next?.addEventListener('click', nextMission);
}

// ---------- ごほうび（宝箱） ----------
const CHEST_SVG = `<svg viewBox="0 0 240 190" aria-hidden="true">
  <g class="rays" fill="#ffe7a1">${Array.from({ length: 12 }, (_, i) => `<path d="M120 80 L${120 + 140 * Math.cos((i * 30 - 4) * Math.PI / 180)} ${80 + 140 * Math.sin((i * 30 - 4) * Math.PI / 180)} L${120 + 140 * Math.cos((i * 30 + 4) * Math.PI / 180)} ${80 + 140 * Math.sin((i * 30 + 4) * Math.PI / 180)}Z" opacity=".55"/>`).join('')}</g>
  <ellipse cx="120" cy="176" rx="86" ry="10" fill="#e7d5b6" opacity=".6"/>
  <rect x="40" y="86" width="160" height="86" rx="14" fill="#d9884a" stroke="#9a5a2c" stroke-width="5"/>
  <rect x="40" y="112" width="160" height="14" fill="#c4733a"/>
  <rect x="62" y="86" width="16" height="86" fill="#f2c062" stroke="#b98a2c" stroke-width="3"/>
  <rect x="162" y="86" width="16" height="86" fill="#f2c062" stroke="#b98a2c" stroke-width="3"/>
  <g class="lid">
    <path d="M40 90 Q40 40 120 40 Q200 40 200 90 Z" fill="#e39656" stroke="#9a5a2c" stroke-width="5" stroke-linejoin="round"/>
    <path d="M62 90 Q62 48 70 46 L78 45 Q78 60 78 90Z" fill="#f2c062"/>
    <path d="M162 90 Q162 52 162 45 L170 46 Q178 48 178 90Z" fill="#f2c062"/>
  </g>
  <rect x="106" y="92" width="28" height="30" rx="7" fill="#ffe08a" stroke="#b98a2c" stroke-width="3"/>
  <circle cx="120" cy="104" r="4" fill="#9a5a2c"/><rect x="118" y="105" width="4" height="9" fill="#9a5a2c"/>
</svg>`;
function renderReward() {
  const R = S.reward;
  const isTut = R.kind === 'tutorial';
  const stage = isTut ? null : STAGES[S.grade][R.index - 1];
  const friend = isTut ? null : COMPANIONS[S.grade][R.index - 1];
  const allClear = !isTut && STAGES[S.grade].every((s) => S.progress.cleared.includes(s.id));
  if (!R.opened) {
    say(t('たからばこを<br>タップして あけよう！ 🎁', '宝箱をタップして<br>開けよう！ 🎁'));
    app.innerHTML = `<div class="reward">
      <div class="eyebrow">${isTut ? 'TUTORIAL CLEAR' : `STAGE ${R.index} CLEAR`}</div>
      <h2>${isTut ? t('チュートリアル クリア！', 'チュートリアル クリア！') : t('ステージ クリア！', 'ステージ クリア！')}</h2>
      <p class="helper">${t('さいごまで がんばったね。', '最後までがんばったね。')}</p>
      <button type="button" class="chest-btn" id="chest" aria-label="たからばこを あける">${CHEST_SVG}</button>
      <p class="tap-label">👆 タップ！</p></div>`;
    $('#chest').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.classList.add('open'); btn.disabled = true;
      sfx('fanfare'); confetti(); hop();
      setTimeout(() => { R.opened = true; render(); }, reduceMotion ? 0 : 650);
    });
    return;
  }
  say(isTut ? t('ステージ1が<br>ひらいたよ！ 🗺️', 'ステージ1が<br>開いたよ！ 🗺️') : allClear ? t('ぜんぶの なかまが<br>そろったよ！ 🎉', '仲間が全員<br>そろったよ！ 🎉') : t('あたらしい なかまが<br>できたよ！ 🐾', '新しい仲間が<br>できたよ！ 🐾'));
  const prize = isTut
    ? `<div class="friend-card prize"><span class="new">GET!</span><span class="emoji" aria-hidden="true">🗺️</span><b>${t('ぼうけんの ちず', 'ぼうけんの地図')}</b><p>${t('ステージ1〜6が ちずに あらわれた！ クリアすると なかまが ふえるよ。', 'ステージ1〜6が地図に現れた！ クリアすると仲間が増えるよ。')}</p></div>
       <span class="badge prize">🐾 スキル：${t('たんけんの きほん', 'たんけんの基本')}</span>`
    : `<div class="friend-card prize"><span class="new">NEW なかま!</span><span class="emoji" aria-hidden="true">${friend.emoji}</span><b>${esc(friend.name)}</b><p>「${esc(friend.line)}」</p></div>
       <span class="badge prize">${stage.skill.icon} スキル：${esc(stage.skill.name)}</span>`;
  const hasNext = isTut || R.index < 6;
  app.innerHTML = `<div class="reward">
    <div class="eyebrow">${isTut ? 'TUTORIAL CLEAR' : `STAGE ${R.index} CLEAR`}</div>
    <button type="button" class="chest-btn open" disabled aria-hidden="true" tabindex="-1">${CHEST_SVG}</button>
    ${prize}
    ${allClear ? `<p class="helper" style="margin-top:8px">${t('6ステージ ぜんぶ クリア！ すきな ステージに もういちど ちょうせん できるよ。', '6ステージ全部クリア！ 好きなステージにもう一度挑戦できるよ。')}</p>` : ''}
    </div>
    <div class="cta-bar"><div class="row">
      <button type="button" class="secondary" id="map">🗺️ マップ</button>
      ${hasNext ? `<button type="button" class="primary" id="next">${t('つぎへ', '次へ')} →</button>` : `<button type="button" class="primary mint" id="zukan">🐾 ずかんを みる</button>`}
    </div></div>`;
  $('#map').addEventListener('click', () => { sfx('tap'); go('map'); });
  $('#next')?.addEventListener('click', () => startStage(isTut ? 1 : R.index + 1));
  $('#zukan')?.addEventListener('click', () => { sfx('tap'); go('friends'); });
}

// ---------- なかま図鑑 ----------
function renderFriends() {
  const got = STAGES[S.grade].map((s) => S.progress.cleared.includes(s.id));
  const n = got.filter(Boolean).length;
  say(n ? t(`なかまが ${n}にん<br>あつまったよ！`, `仲間が${n}人<br>集まったよ！`) : t('ステージを クリアして<br>なかまを ふやそう！', 'ステージをクリアして<br>仲間を増やそう！'));
  const cells = COMPANIONS[S.grade].map((f, i) => `<div class="cell ${got[i] ? '' : 'locked'}"><span class="emoji" aria-hidden="true">${f.emoji}</span><b>${got[i] ? esc(f.name) : `ステージ${i + 1}で あえる`}</b></div>`).join('');
  const skills = STAGES[S.grade].filter((s, i) => got[i]).map((s) => `<span class="badge">${s.skill.icon} ${esc(s.skill.name)}</span>`).join('');
  app.innerHTML = `<div class="progress-top"><button type="button" class="back" id="back">← マップ</button><span class="step-pill">🎁 ${n} / 6</span></div>
    <h2>なかま ずかん</h2>
    <p class="helper">${t('ステージを クリアすると、なかまと スキルが ふえるよ。', 'ステージをクリアすると、仲間とスキルが増えるよ。')}</p>
    <div class="zukan">${cells}</div>
    <div class="group-label">${t('おぼえた スキル', '覚えたスキル')}</div>
    <div class="skills">${skills || `<span class="muted">${t('まだ ないよ。ステージ1に ちょうせん！', 'まだないよ。ステージ1に挑戦！')}</span>`}</div>
    <div class="cta-bar"><button type="button" class="primary" id="map">🗺️ マップに もどる</button></div>`;
  $('#back').addEventListener('click', () => { sfx('tap'); go('map'); });
  $('#map').addEventListener('click', () => { sfx('tap'); go('map'); });
}

// ---------- おうちの人へ ----------
const PAPER_LABEL = { self: '自分から書けた', prompt: '声かけで書けた', oral: '口で言えた（書くのはお休み）', quick: '自分から書き始めた', avoid: '書き始められなかった' };
const HELP_LABEL = { decode: '問いの読み取り', evidence: '根拠さがし', build: '答えの組み立て', check: '答えの見直し' };
const HELP_TIP = {
  decode: '紙の問題でも、まず「何を聞いている？」と問いのことばに丸をつける声かけを。',
  evidence: '「どの文に書いてある？」と、答えの文に線を引く声かけを。',
  build: '「〜から。」など、答えの終わり方を先に決めてから書くよう声かけを。',
  check: '書いたあと「問いに合っている？」と一緒に読み直してみてください。',
};
// ヒントの内訳（ver3.0 から）：0回のミッションは省く
function recordMeta(r) {
  const by = Object.entries(r.hintsBy ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${HELP_LABEL[k]}${v}`).join('・');
  const self = r.selfCheckOf ? ` ／ じぶんチェック ${r.selfCheck}/${r.selfCheckOf}` : '';
  return `ヒント ${r.hints}回${by ? `（${by}）` : ''} ／ 紙：${PAPER_LABEL[r.paper] ?? '-'}${self} ／ ${r.plays}回目・${r.date}`;
}
function reportText() {
  const p = S.progress; const g = S.grade;
  const lines = [`【しばまるの こくごたんけん】小学${g}年生 / ${new Date().toLocaleDateString('ja-JP')}`, ''];
  if (p.tutorial) {
    const a = analyzeTutorial(p.tutorial);
    lines.push('■ チュートリアル（1問チェック）',
      `問いの理解：${p.tutorial.intent === 1 ? '理由を聞く問題だと選べた' : '別の選択肢を選んだ'}`,
      `口頭回答：${TUT_LABEL.oral[p.tutorial.oral]}`, `書き始め：${TUT_LABEL.start[p.tutorial.start]}`, `書いた答え：${TUT_LABEL.written[p.tutorial.written]}`,
      `観察のヒント：${a.title}`, a.text, `メモ：${p.tutorial.note || 'なし'}`, '');
  }
  lines.push('■ ステージ');
  STAGES[g].forEach((s, i) => {
    const r = p.records[s.id];
    lines.push(r ? `${i + 1}. ${s.title}（${s.skill.name}）：${recordMeta(r)}` : `${i + 1}. ${s.title}：まだ`);
  });
  const focus = helpFocus(p.records);
  if (focus) lines.push('', `手助けが多かったところ：${HELP_LABEL[focus]}（${HELP_TIP[focus]}）`);
  lines.push('', '※記録は観察のきっかけです。学力や発達の状態を判断するものではありません。');
  return lines.join('\n');
}
function renderParent() {
  const p = S.progress;
  say('ここは おうちの人<br>むけの ページだよ 👪');
  const tut = p.tutorial ? (() => {
    const a = analyzeTutorial(p.tutorial);
    return `<div class="result-box"><div class="result-head">🐾 ${esc(a.title)}</div><p>${esc(a.text)}</p></div>${tutorialGrid(p.tutorial)}
      ${p.tutorial.note ? `<p class="muted"><strong>メモ：</strong>${esc(p.tutorial.note).replace(/\n/g, '<br>')}</p>` : ''}`;
  })() : '<p class="muted">チュートリアルはまだです。マップの最初から始めてください。</p>';
  const log = STAGES[S.grade].map((s, i) => {
    const r = p.records[s.id];
    return `<li class="${r ? '' : 'todo'}"><span class="ic" aria-hidden="true">${r ? COMPANIONS[S.grade][i].emoji : '・'}</span><span><b>${i + 1}. ${esc(s.title)}</b>（${esc(s.skill.name)}）
      <span class="meta">${r ? esc(recordMeta(r)) : 'まだ'}</span></span></li>`;
  }).join('');
  const focus = helpFocus(p.records);
  const focusBox = focus ? `<div class="result-box focus-box"><div class="result-head">💡 手助けが多かったところ：${esc(HELP_LABEL[focus])}</div><p>${esc(HELP_TIP[focus])}</p></div>` : '';
  app.innerHTML = `<div class="progress-top"><button type="button" class="back" id="back">← マップ</button><span class="step-pill">小学${S.grade}年生</span></div>
    <h2>おうちの人へ</h2>
    <p class="helper">ヒントの回数は減点ではなく「どこで手助けが要ったか」の目安です。紙に書けた日・お休みの日の変化を1〜2週間ゆるく見てください。</p>
    <div class="group-label">🐾 チュートリアル（1問チェック）の結果</div>
    ${tut}
    <div class="group-label">🗺️ ステージの記録</div>
    ${focusBox}
    <ul class="log">${log}</ul>
    <div class="row" style="display:flex;gap:10px">
      <button type="button" class="secondary" id="copy">📋 記録をコピー</button>
      <button type="button" class="secondary danger ${S.resetArmed ? 'armed' : ''}" id="reset">${S.resetArmed ? 'もう一度押すと消えます' : '🗑️ 記録をリセット'}</button>
    </div>
    <div id="copy-slot"></div>
    <p class="tiny-rule">※データはこの端末のブラウザ内だけに保存され、外部へ送信しません。1年生と3年生の記録は別々に保存されます。</p>
    <div class="cta-bar"><button type="button" class="primary" id="map">🗺️ マップに もどる</button></div>`;
  $('#back').addEventListener('click', () => { sfx('tap'); go('map'); });
  $('#map').addEventListener('click', () => { sfx('tap'); go('map'); });
  $('#reset').addEventListener('click', () => {
    if (!S.resetArmed) { S.resetArmed = true; render(); setTimeout(() => { if (S.resetArmed && S.screen === 'parent') { S.resetArmed = false; render(); } }, 4000); return; }
    S.resetArmed = false;
    S.progress = { cleared: [], records: {}, tutorial: null };
    save(); go('map');
  });
  $('#copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget; const text = reportText(); let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch { /* fallback */ }
    if (!ok) {
      const el = document.createElement('textarea'); el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select(); try { ok = document.execCommand('copy'); } catch { /* noop */ } el.remove();
    }
    if (ok) btn.textContent = '✓ コピーしたよ';
    else {
      const out = document.createElement('textarea'); out.value = text; out.readOnly = true; out.className = 'copy-out';
      out.setAttribute('aria-label', 'コピー用の記録'); $('#copy-slot').replaceChildren(out); out.focus(); out.select();
      btn.textContent = '下の文章をコピー';
    }
  });
}

// ---------- 起動 ----------
history.replaceState({ screen: 'title' }, '');
render();
// テスト・デバッグ用（E2E から状態確認に使う）
window.__shibamaru = { S, normalize };

/* Version History
 * ver3.1 (2026-10-20): マップに「チュートリアルを とばす」（記録は作らず、ステージ1へ直行）。3年の条件えらびに本文を表示
 * ver3.0 (2026-10-19): ステージを5ミッションに。1年＝問いのことばタップ→こたえの かたち、文末カードの支え、とい＋こたえを つなげて よむ、なかまの こたえ○×。3年＝条件の複数選択、先生になって丸つけ、見本を隠して書く＋じぶんチェック。保護者ページにヒントの内訳と「手助けが多かったところ」
 * ver1.1 (2026-10-18): 文字を削減（チュートリアルの操作説明カード撤去、説明文の重複削除、保護者向け文言を短文化）。UIとしばまるの吹き出しで操作が分かる形に
 * ver1.0 (2026-10-18): 新規。タイトル（学年選択）→ぼうけんマップ→チュートリアル（元1問チェック＋操作説明）→6ステージ（解読・根拠・組み立て・紙）→宝箱→なかま図鑑・保護者ページ
 */
