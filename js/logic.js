// しばまるの こくごたんけん — 画面に依存しない純粋ロジック（tests/logic.test.mjs で検証）

export const charCount = (s) => Array.from(String(s ?? '').replace(/\s/g, '')).length;
export const normalize = (s) => String(s ?? '').replace(/\s/g, '');

export function checkOrder(picked, answer) {
  return picked.length === answer.length && picked.every((v, i) => v === answer[i]);
}

export const defaultProgress = () => ({ cleared: [], records: {}, tutorial: null });

export function isUnlocked(progress, ids, index) {
  if (index === 0) return true;
  return progress.cleared.includes(ids[index - 1]);
}

export function completeStage(progress, id, record) {
  const prev = progress.records[id];
  return {
    ...progress,
    cleared: progress.cleared.includes(id) ? [...progress.cleared] : [...progress.cleared, id],
    records: {
      ...progress.records,
      [id]: { ...record, plays: (prev?.plays ?? 0) + 1, date: new Date().toISOString().slice(0, 10) },
    },
  };
}

// チュートリアルを とばす：ステージ1は開くが、観察の記録（records/tutorial）は作らない
export const skipTutorial = (progress) => (progress.cleared.includes('tutorial') ? progress : { ...progress, cleared: ['tutorial', ...progress.cleared] });

// 元アプリ（legacy/shiba_kokugo_check.html）の analysis() と同じ優先順
export function analyzeTutorial(s) {
  if (s.intent !== 1) return { title: 'まずは「何を聞かれているか」を読む練習', text: '今回の問題では、答える内容の選択がずれました。問いにある「どうして／なぜ」を見つけて、理由を答える問題だと確認する練習がよさそう。' };
  if (s.oral === 'no') return { title: '答えの根拠を見つける練習から', text: '問いの内容は選べたものの、口頭では答えられませんでした。本文の「雨が降り始めた」「傘を持っていなかった」に線を引き、理由を見つける練習がよさそう。' };
  if (s.start === 'avoid') return { title: '「書き始める負担」を減らすことから', text: '問いの理解や口頭回答に比べ、紙に書き始めるところに負担が見られます。口で答えたあと、最初の数文字だけ書くなど、少ない量から試してみよう。' };
  if (s.written === 'no' || s.written === 'partial') return { title: '口で言えた答えを、短い文にする練習', text: '口で考えた内容を紙の文にする段階で、負担やつまずきがあるかもしれません。「〜からです」を使った短い1文から練習してみよう。' };
  if (s.oral === 'hint' || s.start === 'prompt') return { title: '少しの手助けを、少しずつ減らしていこう', text: 'ヒントや声かけがあれば前に進めました。最初は同じ流れで支え、慣れたら「どこを見ればいい？」と自分で確認できるようにするとよさそう。' };
  return { title: '今回の1問は、自力で進められたね！', text: '問いの意味、口頭回答、書く行動のいずれも大きなつまずきは見られませんでした。本番のステージで、いろいろな問い方にもちょうせんしてみよう。' };
}

// ---------- ver3.0：問いのことば・こたえの かたち・チェック ----------
export const MISSIONS = ['decode', 'evidence', 'build', 'check', 'paper'];

// ミッションの中の小問の数（1年の ひみつ＝ことばタップ＋かたち、チェック＝なかまの こたえの数）
export function subCount(stage, kind) {
  if (kind === 'decode') return stage.grade === 1 ? 2 : 1;
  if (kind === 'check') return stage.grade === 1 ? stage.judge.length : 1;
  return 1;
}

export const inPassage = (passage, text) => normalize(passage.join('')).includes(normalize(text));

// 問いの文をタップ用のチップに分ける。問いのことば（qword）は1枚にまとめ、句読点だけのかけらは前のチップにつなげる
export function questionChips(question, qword) {
  const at = question.indexOf(qword);
  const pieces = (str) => str.split(/(?<=、)|\s+/).filter(Boolean);
  const raw = [
    ...pieces(question.slice(0, at)).map((text) => ({ text, key: false })),
    { text: qword, key: true },
    ...pieces(question.slice(at + qword.length)).map((text) => ({ text, key: false })),
  ];
  const out = [];
  for (const c of raw) {
    if (/^[、。？！?!」』]+$/.test(c.text) && out.length) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + c.text };
    else out.push(c);
  }
  return out;
}

// 文末カードが最初から置いてあるとき（fixedEnd）は、えらんだカードの後ろに文末カードを足して判定する
export const fullPick = (picked, build) => (build.fixedEnd ? [...picked, build.answer[build.answer.length - 1]] : [...picked]);

export const sameSet = (a, b) => a.length === b.length && b.every((x) => a.includes(x));

// 保護者ページ用：ヒントがいちばん多かったミッション（ver2 の内訳なし記録は数えない）
export function helpFocus(records) {
  const sum = {};
  for (const r of Object.values(records ?? {})) for (const [k, v] of Object.entries(r?.hintsBy ?? {})) sum[k] = (sum[k] ?? 0) + v;
  const top = Object.entries(sum).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : null;
}

export function validateStage(s) {
  const e = [];
  const inRange = (i, arr) => Number.isInteger(i) && i >= 0 && i < arr.length;
  const three = (arr) => arr?.length === 3;
  if (!s.id || !s.title || !s.question) e.push(`${s.id}: id/title/question が必要`);
  if (!Array.isArray(s.passage) || s.passage.length < 2) e.push(`${s.id}: passage は2文以上`);
  const passage = s.passage ?? [];
  if (s.grade === 1) {
    if (!s.qword || !s.question?.includes(s.qword)) e.push(`${s.id}: qword（問いのことば）が問いの中にない`);
    const sh = s.shape ?? {};
    if (sh.choices?.length !== 3 || !inRange(sh.answer, sh.choices ?? []) || !sh.tip) e.push(`${s.id}: こたえの かたちの選択肢は3つ＋正解＋tip`);
    if (!three(sh.hints)) e.push(`${s.id}: こたえの かたちの hints は3段階`);
    const j = s.judge ?? [];
    if (!j.some((x) => x.ok)) e.push(`${s.id}: judge に まる（ok）の こたえがない`);
    if (!j.some((x) => !x.ok && inPassage(passage, x.text))) e.push(`${s.id}: judge に本文の写しの まちがいがない`);
    if (!j.every((x) => x.text && x.why)) e.push(`${s.id}: judge には text と why が必要`);
  } else {
    const c = s.conds ?? {};
    if (!(c.choices?.length >= 3) || !(c.answers?.length >= 2) || !c.answers.every((i) => inRange(i, c.choices)) || !c.tip) e.push(`${s.id}: 条件の選択肢は3つ以上・正解2つ以上・tip`);
    const r = s.review ?? [];
    const ok = r.filter((x) => x.ok);
    if (r.length < 2 || ok.length !== 1) e.push(`${s.id}: 丸つけは2つ以上で、100点は1つだけ`);
    if (!r.every((x) => x.ok || x.flaw)) e.push(`${s.id}: 丸つけの まちがいには flaw が必要`);
    if (ok[0] && s.maxChars && charCount(ok[0].text) > s.maxChars) e.push(`${s.id}: 丸つけの100点が${s.maxChars}字をこえる`);
    if (ok[0] && s.extract && !inPassage(passage, ok[0].text)) e.push(`${s.id}: 丸つけの100点（書きぬき）が本文にない`);
    for (const x of r) {
      const m = /（(\d+)字）/.exec(x.flaw ?? '');
      if (m && Number(m[1]) !== charCount(x.text)) e.push(`${s.id}: 字数の表示がちがう「${x.text}」は${charCount(x.text)}字`);
    }
  }
  if (!s.evidence?.length || !s.evidence.every((i) => inRange(i, passage))) e.push(`${s.id}: evidence が本文の範囲外`);
  const b = s.build ?? {};
  if (b.type === 'cards') {
    if (!b.answer?.every((i) => inRange(i, b.cards))) e.push(`${s.id}: カードの正解 index が範囲外`);
    else if (normalize(b.answer.map((i) => b.cards[i]).join('')) !== normalize(s.exampleAnswer)) e.push(`${s.id}: カードを並べた文が解答例と一致しない`);
    const dummies = (b.cards ?? []).filter((_, i) => !b.answer?.includes(i));
    if (!dummies.length) e.push(`${s.id}: ダミーのカードがない`);
    else if (s.grade === 1 && !dummies.some((d) => inPassage(passage, d))) e.push(`${s.id}: ダミーのカードに本文の写しがない`);
  } else if (b.type === 'choice') {
    if (b.choices?.length !== 3 || !inRange(b.answer, b.choices)) e.push(`${s.id}: 答えの選択肢が不正`);
    else if (normalize(b.choices[b.answer]) !== normalize(s.exampleAnswer)) e.push(`${s.id}: 選択肢の正解が解答例と一致しない`);
  } else e.push(`${s.id}: build.type が不明`);
  if (s.maxChars && charCount(s.exampleAnswer) > s.maxChars) e.push(`${s.id}: 解答例が${s.maxChars}字をこえる`);
  if (s.extract && !inPassage(passage, s.exampleAnswer)) e.push(`${s.id}: 書きぬきの答えが本文にない`);
  for (const k of ['decode', 'evidence', 'build']) if (!three(s.hints?.[k])) e.push(`${s.id}: hints.${k} は3段階`);
  return e;
}

export const storageKey = (grade) => `shibamaru:v1:g${grade}`;

export function loadProgress(storage, grade) {
  try {
    const raw = storage?.getItem(storageKey(grade));
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw);
    if (!Array.isArray(p.cleared) || typeof p.records !== 'object') return defaultProgress();
    return { ...defaultProgress(), ...p };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(storage, grade, progress) {
  try { storage?.setItem(storageKey(grade), JSON.stringify(progress)); } catch { /* 保存できない環境でもメモリで続行 */ }
}

/* Version History
 * ver3.1 (2026-10-20): チュートリアルを とばす skipTutorial を追加
 * ver3.0 (2026-10-19): 問いのことばチップ（questionChips）・文末カードの支え（fullPick）・条件の複数選択（sameSet）・ミッション5つ（MISSIONS/subCount）・手助けの集計（helpFocus）。validateStage を1年（qword/shape/judge）と3年（conds/review）の新形式に対応
 * ver1.0 (2026-10-18): 新規。カード判定・解放・記録・チュートリアル分析（元 analysis() 移植）・問題データ検証・保存
 */
