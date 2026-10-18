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

// 元アプリ（legacy/shiba_kokugo_check.html）の analysis() と同じ優先順
export function analyzeTutorial(s) {
  if (s.intent !== 1) return { title: 'まずは「何を聞かれているか」を読む練習', text: '今回の問題では、答える内容の選択がずれました。問いにある「どうして／なぜ」を見つけて、理由を答える問題だと確認する練習がよさそう。' };
  if (s.oral === 'no') return { title: '答えの根拠を見つける練習から', text: '問いの内容は選べたものの、口頭では答えられませんでした。本文の「雨が降り始めた」「傘を持っていなかった」に線を引き、理由を見つける練習がよさそう。' };
  if (s.start === 'avoid') return { title: '「書き始める負担」を減らすことから', text: '問いの理解や口頭回答に比べ、紙に書き始めるところに負担が見られます。口で答えたあと、最初の数文字だけ書くなど、少ない量から試してみよう。' };
  if (s.written === 'no' || s.written === 'partial') return { title: '口で言えた答えを、短い文にする練習', text: '口で考えた内容を紙の文にする段階で、負担やつまずきがあるかもしれません。「〜からです」を使った短い1文から練習してみよう。' };
  if (s.oral === 'hint' || s.start === 'prompt') return { title: '少しの手助けを、少しずつ減らしていこう', text: 'ヒントや声かけがあれば前に進めました。最初は同じ流れで支え、慣れたら「どこを見ればいい？」と自分で確認できるようにするとよさそう。' };
  return { title: '今回の1問は、自力で進められたね！', text: '問いの意味、口頭回答、書く行動のいずれも大きなつまずきは見られませんでした。本番のステージで、いろいろな問い方にもちょうせんしてみよう。' };
}

export function validateStage(s) {
  const e = [];
  const inRange = (i, arr) => Number.isInteger(i) && i >= 0 && i < arr.length;
  if (!s.id || !s.title || !s.question) e.push(`${s.id}: id/title/question が必要`);
  if (!Array.isArray(s.passage) || s.passage.length < 2) e.push(`${s.id}: passage は2文以上`);
  for (const d of s.decode ?? []) {
    if (d.choices?.length !== 3) e.push(`${s.id}: 解読の選択肢は3つ (${d.ask})`);
    if (!inRange(d.answer, d.choices ?? [])) e.push(`${s.id}: 解読の正解 index が範囲外 (${d.ask})`);
  }
  if (!s.decode?.length) e.push(`${s.id}: decode が空`);
  if (!s.evidence?.length || !s.evidence.every((i) => inRange(i, s.passage ?? []))) e.push(`${s.id}: evidence が本文の範囲外`);
  const b = s.build ?? {};
  if (b.type === 'cards') {
    if (!b.answer?.every((i) => inRange(i, b.cards))) e.push(`${s.id}: カードの正解 index が範囲外`);
    else if (normalize(b.answer.map((i) => b.cards[i]).join('')) !== normalize(s.exampleAnswer)) e.push(`${s.id}: カードを並べた文が解答例と一致しない`);
    if (b.cards.length <= b.answer.length) e.push(`${s.id}: ダミーのカードがない`);
  } else if (b.type === 'choice') {
    if (b.choices?.length !== 3 || !inRange(b.answer, b.choices)) e.push(`${s.id}: 答えの選択肢が不正`);
    else if (normalize(b.choices[b.answer]) !== normalize(s.exampleAnswer)) e.push(`${s.id}: 選択肢の正解が解答例と一致しない`);
  } else e.push(`${s.id}: build.type が不明`);
  if (s.maxChars && charCount(s.exampleAnswer) > s.maxChars) e.push(`${s.id}: 解答例が${s.maxChars}字をこえる`);
  if (s.extract && !normalize(s.passage.join('')).includes(normalize(s.exampleAnswer))) e.push(`${s.id}: 書きぬきの答えが本文にない`);
  for (const k of ['decode', 'evidence', 'build']) if (s.hints?.[k]?.length !== 3) e.push(`${s.id}: hints.${k} は3段階`);
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
 * ver1.0 (2026-10-18): 新規。カード判定・解放・記録・チュートリアル分析（元 analysis() 移植）・問題データ検証・保存
 */
