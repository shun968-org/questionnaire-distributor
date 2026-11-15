// 1 コースの配信スケジュールを、ドラッグで組むボード。値は親のフォームの状態で持ち、ここでは持たない。
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { DeliveryRule, Drug, QuestionnaireSummary } from '../api/client.ts';
import { Icon } from './icons.tsx';

type Props = {
  cycleLengthDays: number;
  cycleCount: number;
  baselineDays: number;
  questionnaires: QuestionnaireSummary[];
  drugs: Drug[];
  onDrugsChange: (drugs: Drug[]) => void;
  rules: DeliveryRule[];
  onRulesChange: (rules: DeliveryRule[]) => void;
  /** 保存していない変更があるか。あるときは、質問票のプレビューへ移る前に確かめる */
  hasUnsavedChanges?: boolean;
};

const DAY_WIDTH = 34;
const COLORS = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0891b2'];
const DRAG_TYPE = 'application/x-questionnaire-id';
// 行の並べ替えのドラッグ。薬剤の表と質問票の表で種類を分け、表をまたいでは動かせないようにする
const ROW_DRAG_TYPE = { drug: 'application/x-row-drug', questionnaire: 'application/x-row-questionnaire' } as const;
type RowKind = keyof typeof ROW_DRAG_TYPE;

/** 配列の from 番目を、to 番目へ動かす */
function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

export function ScheduleBoard(props: Props) {
  const { questionnaires, rules, drugs } = props;
  // 入力の途中で不正な値になっても描けるようにする
  const cycleLength = clamp(Math.trunc(props.cycleLengthDays) || 1, 1, 366);
  const baseline = clamp(Math.trunc(props.baselineDays) || 0, 0, 60);
  const cycleCount = clamp(Math.trunc(props.cycleCount) || 1, 1, 100);
  const totalDays = baseline + cycleLength;

  const [selected, setSelected] = useState<number | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);
  // 表に行を出す質問票と、その順。配信がなくなっても、取り消す(ゴミ箱)までは行を残す。
  // 順は、配信の有無で変わらないよう、ここで持つ(最初は、配信の並びの順)
  const [rowOrder, setRowOrder] = useState<string[]>(() => [...new Set(rules.map((r) => r.questionnaireId))]);
  const rowIds = [...new Set([...rowOrder, ...rules.map((r) => r.questionnaireId)])];
  // トラックの空いたところをドラッグして、配信のバーを描いている途中の状態
  const [draw, setDraw] = useState<{ row: string; questionnaireId: string; start: number; end: number } | null>(null);
  const drag = useRef<{ index: number; mode: 'move' | 'resize'; startX: number; origin: DeliveryRule; moved: boolean } | null>(null);

  /** 配信日と回答可能期間を、ベースライン期間またはコースの中に収める */
  const fit = (rule: DeliveryRule): DeliveryRule => {
    const dayOffset = clamp(rule.dayOffset, -baseline, cycleLength - 1);
    const room = dayOffset < 0 ? -dayOffset : cycleLength - dayOffset;
    return { ...rule, dayOffset, windowDays: clamp(rule.windowDays, 1, room) };
  };

  const replaceRule = (index: number, rule: DeliveryRule) => props.onRulesChange(rules.map((r, i) => (i === index ? fit(rule) : r)));

  /** ベースラインの配信の既定: ベースライン期間の全体を、回答可能期間にする */
  const baselineRule = (questionnaireId: string): DeliveryRule => ({
    questionnaireId,
    dayOffset: -baseline,
    windowDays: baseline,
    cycleFrom: 1,
    cycleTo: null,
  });

  const addRule = (questionnaireId: string, dayOffset: number, windowDays = 3) => {
    const added = [fit({ questionnaireId, dayOffset, windowDays, cycleFrom: 1, cycleTo: null })];
    // 質問票を計画に初めて置くときは、ベースラインの配信も付ける(既定はベースラインあり。後から外せる)
    const isFirst = !rowIds.includes(questionnaireId);
    if (isFirst && baseline > 0 && dayOffset >= 0) added.push(baselineRule(questionnaireId));
    if (isFirst) setRowOrder((ids) => [...ids, questionnaireId]);
    props.onRulesChange([...rules, ...added]);
    setSelected(rules.length);
  };

  /** 質問票を治療計画に追加する(表に行を足す)。既定で、ベースラインの配信を付ける */
  const addQuestionnaire = (questionnaireId: string) => {
    if (rowIds.includes(questionnaireId)) return;
    setRowOrder((ids) => [...ids, questionnaireId]);
    if (baseline > 0) props.onRulesChange([...rules, baselineRule(questionnaireId)]);
    setSelected(null);
  };

  /** 質問票を、治療計画から取り消す(その質問票の配信を、ベースラインも含めてすべて外す) */
  const removeQuestionnaire = (questionnaireId: string) => {
    const count = rules.filter((r) => r.questionnaireId === questionnaireId).length;
    if (!window.confirm(`「${nameOf(questionnaireId)}」を、この治療計画から取り消す(配信 ${count} 件をすべて外す)。よいか?`)) return;
    props.onRulesChange(rules.filter((r) => r.questionnaireId !== questionnaireId));
    setRowOrder((ids) => ids.filter((id) => id !== questionnaireId));
    setSelected(null);
  };

  const removeRule = (index: number) => {
    props.onRulesChange(rules.filter((_, i) => i !== index));
    setSelected(null);
  };

  const dayAt = (clientX: number, track: HTMLElement) =>
    clamp(Math.floor((clientX - track.getBoundingClientRect().left) / DAY_WIDTH), 0, totalDays - 1) - baseline;

  const onBarPointerDown = (e: ReactPointerEvent<HTMLElement>, index: number, mode: 'move' | 'resize') => {
    const origin = rules[index];
    if (!origin || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { index, mode, startX: e.clientX, origin, moved: false };
    setSelected(index);
  };

  const onBarPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((e.clientX - d.startX) / DAY_WIDTH);
    if (delta !== 0) d.moved = true;
    if (!d.moved) return;
    // つかんだ時点の値から計算する(境界で縮んだ期間が、戻したときに元に戻る)
    replaceRule(
      d.index,
      d.mode === 'move'
        ? { ...d.origin, dayOffset: d.origin.dayOffset + delta }
        : { ...d.origin, windowDays: Math.max(1, d.origin.windowDays + delta) },
    );
  };

  const onBarPointerUp = () => {
    drag.current = null;
  };

  /** 描いている範囲。始めた側(ベースライン期間か、コースの中か)からは、はみ出さない */
  const drawRange = (d: { start: number; end: number }) => {
    const end = d.start < 0 ? clamp(d.end, -baseline, -1) : clamp(d.end, 0, cycleLength - 1);
    return { from: Math.min(d.start, end), to: Math.max(d.start, end) };
  };

  /** トラックの空いたところを押してドラッグすると、その範囲を回答可能期間とする配信を描く */
  const drawProps = (row: string, questionnaireId: string | null) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !questionnaireId) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const day = dayAt(e.clientX, e.currentTarget);
      setDraw({ row, questionnaireId, start: day, end: day });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (draw?.row !== row) return;
      const end = dayAt(e.clientX, e.currentTarget);
      if (end !== draw.end) setDraw({ ...draw, end });
    },
    onPointerUp: () => {
      if (draw?.row !== row) return;
      const { from, to } = drawRange(draw);
      // 押しただけ(動かしていない)なら、何も作らない
      if (draw.end !== draw.start) addRule(draw.questionnaireId, from, to - from + 1);
      setDraw(null);
    },
    onPointerCancel: () => setDraw(null),
  });

  const drawPreview = (row: string) => {
    if (draw?.row !== row) return null;
    const { from, to } = drawRange(draw);
    return <div className="draw-preview" style={{ left: (from + baseline) * DAY_WIDTH, width: (to - from + 1) * DAY_WIDTH }} />;
  };

  const trackProps = {
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setDropDay(dayAt(e.clientX, e.currentTarget));
    },
    onDragLeave: () => setDropDay(null),
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      e.preventDefault();
      addRule(id, dayAt(e.clientX, e.currentTarget));
      setDropDay(null);
    },
  };

  /** 質問票の名前。クリックすると、その質問票のプレビューへ移る(編集は、プレビューの「編集する」から) */
  const questionnaireLink = (id: string) => (
    <Link
      to={`/questionnaires/${id}`}
      draggable={false}
      title="この質問票のプレビューを開く"
      onClick={(e) => {
        if (props.hasUnsavedChanges && !window.confirm('治療計画に、保存していない変更がある。破棄して、質問票のプレビューへ移るか?')) {
          e.preventDefault();
        }
      }}
    >
      {nameOf(id)}
    </Link>
  );

  const colorOf = (id: string) => COLORS[Math.max(0, questionnaires.findIndex((q) => q.id === id)) % COLORS.length]!;
  const nameOf = (id: string) => questionnaires.find((q) => q.id === id)?.name ?? '(質問票マスタにない)';
  const days = Array.from({ length: totalDays }, (_, i) => i - baseline);
  const trackStyle = { width: totalDays * DAY_WIDTH, backgroundSize: `${DAY_WIDTH}px 100%` };
  const zones = (
    <>
      {baseline > 0 && <div className="zone-baseline" style={{ width: baseline * DAY_WIDTH }} />}
      {dropDay !== null && <div className="drop-marker" style={{ left: (dropDay + baseline) * DAY_WIDTH, width: DAY_WIDTH }} />}
    </>
  );

  // 薬剤の表と質問票の表は別だが、日の列は同じ幅で並べ、横スクロールも合わせる
  const drugScroll = useRef<HTMLDivElement>(null);
  const ruleScroll = useRef<HTMLDivElement>(null);
  const syncScroll = (from: React.RefObject<HTMLDivElement | null>, to: React.RefObject<HTMLDivElement | null>) => {
    if (from.current && to.current && to.current.scrollLeft !== from.current.scrollLeft) to.current.scrollLeft = from.current.scrollLeft;
  };

  /** 日の列の見出し。2 つの表で同じものを出す */
  const headRow = (label: string) => (
    <div className="board-row head">
      <div className="board-label">
        {label}(1 コース {cycleLength} 日)
      </div>
      <div className="track head" style={trackStyle}>
        {days.map((d) => (
          <div key={d} className={d < 0 ? 'day baseline' : d % 7 === 0 ? 'day week' : 'day'} style={{ width: DAY_WIDTH }}>
            {d < 0 ? d : d + 1}
          </div>
        ))}
      </div>
    </div>
  );

  // 行の並べ替え。ドラッグ中の行と、落とす先の行
  const [rowDrag, setRowDrag] = useState<{ kind: RowKind; from: number; over: number | null } | null>(null);

  const moveRow = (kind: RowKind, from: number, to: number) => {
    if (kind === 'drug') {
      if (to < 0 || to >= drugs.length || from === to) return;
      props.onDrugsChange(move(drugs, from, to));
      return;
    }
    if (to < 0 || to >= rowIds.length || from === to) return;
    const order = move(rowIds, from, to);
    setRowOrder(order);
    // 配信の並びも行の順に合わせる(保存した後も、行の順が変わらないように)
    props.onRulesChange(order.flatMap((id) => rules.filter((r) => r.questionnaireId === id)));
    setSelected(null);
  };

  /** 行のつまみ。ドラッグして行を並べ替える。キーボードでは、上下の矢印で動かす */
  const rowHandle = (kind: RowKind, index: number, name: string) => (
    <span
      className="row-handle"
      role="button"
      tabIndex={0}
      draggable
      aria-label={`${name} の行を並べ替える`}
      title="ドラッグして行を並べ替える(キーボードでは上下の矢印)"
      onDragStart={(e) => {
        e.dataTransfer.setData(ROW_DRAG_TYPE[kind], String(index));
        e.dataTransfer.effectAllowed = 'move';
        setRowDrag({ kind, from: index, over: null });
      }}
      onDragEnd={() => setRowDrag(null)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        moveRow(kind, index, index + (e.key === 'ArrowUp' ? -1 : 1));
      }}
    >
      <Icon name="grip" size={13} />
    </span>
  );

  /** 行の側の、並べ替えの受け口 */
  const rowDropProps = (kind: RowKind, index: number) => ({
    className: `board-row${rowDrag?.kind === kind && rowDrag.over === index && rowDrag.from !== index ? (rowDrag.from < index ? ' drop-after' : ' drop-before') : ''}${rowDrag?.kind === kind && rowDrag.from === index ? ' dragging' : ''}`,
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!e.dataTransfer.types.includes(ROW_DRAG_TYPE[kind])) return;
      e.preventDefault();
      if (rowDrag && rowDrag.over !== index) setRowDrag({ ...rowDrag, over: index });
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      const from = e.dataTransfer.getData(ROW_DRAG_TYPE[kind]);
      if (from === '') return;
      e.preventDefault();
      moveRow(kind, Number(from), index);
      setRowDrag(null);
    },
  });

  const selectedRule = selected !== null ? rules[selected] : undefined;
  const cyclesLabel = (r: DeliveryRule) =>
    r.dayOffset < 0
      ? 'ベースライン'
      : r.cycleFrom === 1 && r.cycleTo === null
        ? '全コース'
        : `${r.cycleFrom}〜${r.cycleTo ?? cycleCount} コース`;

  return (
    <div className="board">
      <aside className="palette">
        <h4>質問票マスタ</h4>
        <p className="hint">治療計画への追加は、右の表の末尾の行で選ぶ。配信する日へドラッグして置いてもよい。名前をクリックすると、その質問票のプレビューを開く。</p>
        {questionnaires.length === 0 && <p className="hint">質問票がまだない。先に質問票マスタに登録する。</p>}
        {questionnaires.map((q) => (
          <div
            key={q.id}
            className="palette-item"
            draggable
            style={{ borderLeftColor: colorOf(q.id) }}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, q.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => setDropDay(null)}
          >
            <span className="grow">
              {questionnaireLink(q.id)}
              <small>
                {q.sectionCount} 章・{q.questionCount} 問
              </small>
            </span>
          </div>
        ))}
      </aside>

      <div className="board-main">
        <h4>薬剤の投与日</h4>
        <div className="board-scroll" ref={drugScroll} onScroll={() => syncScroll(drugScroll, ruleScroll)}>
          {headRow('薬剤')}

          {drugs.map((drug, i) => (
            <div key={i} {...rowDropProps('drug', i)}>
              <div className="board-label drug">
                {rowHandle('drug', i, drug.name)}
                <input
                  aria-label="薬剤の名前"
                  value={drug.name}
                  onChange={(e) => props.onDrugsChange(drugs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                />
                <select
                  aria-label="投与方法"
                  value={drug.route}
                  onChange={(e) =>
                    props.onDrugsChange(drugs.map((x, k) => (k === i ? { ...x, route: e.target.value as Drug['route'] } : x)))
                  }
                >
                  <option value="IV">点滴</option>
                  <option value="ORAL">内服</option>
                </select>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`${drug.name} の行を削除`}
                  title="薬剤の行を削除"
                  onClick={() => props.onDrugsChange(drugs.filter((_, k) => k !== i))}
                >
                  <Icon name="trash" />
                </button>
              </div>
              <div className="track" style={trackStyle}>
                {days.map((d) => {
                  const day = d + 1;
                  const on = d >= 0 && drug.days.includes(day);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={d < 0}
                      className={`dose ${on ? `on ${drug.route.toLowerCase()}` : ''}`}
                      style={{ width: DAY_WIDTH }}
                      aria-label={`${drug.name} ${day} 日目`}
                      aria-pressed={on}
                      onClick={() =>
                        props.onDrugsChange(
                          drugs.map((x, k) =>
                            k === i
                              ? { ...x, days: on ? x.days.filter((n) => n !== day) : [...x.days, day].sort((a, b) => a - b) }
                              : x,
                          ),
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="board-row">
            <div className="board-label">
              <button type="button" onClick={() => props.onDrugsChange([...drugs, { name: '薬剤', route: 'IV', days: [1] }])}>
                + 薬剤の行を追加
              </button>
            </div>
            <div className="track muted" style={trackStyle}>
              <span className="track-note">薬剤の行は、マスをクリックして投与日を切り替える(配信日を決める目安)</span>
            </div>
          </div>
        </div>

        <h4>質問票の配信</h4>
        <div className="legend">
          <span>
            <i className="swatch baseline" />
            ベースライン(治療開始前に 1 回。治療による変化を見るもとにする)
          </span>
          <span>
            <i className="swatch treatment" />
            治療中の配信(対象のコースで繰り返す。色は質問票ごと)
          </span>
        </div>
        <div className="board-scroll" ref={ruleScroll} onScroll={() => syncScroll(ruleScroll, drugScroll)}>
          {headRow('質問票')}

          {rowIds.map((id, rowIndex) => (
            <div key={id} {...rowDropProps('questionnaire', rowIndex)}>
              <div className="board-label" style={{ borderLeft: `4px solid ${colorOf(id)}` }}>
                {rowHandle('questionnaire', rowIndex, nameOf(id))}
                <span className="grow">{questionnaires.some((q) => q.id === id) ? questionnaireLink(id) : nameOf(id)}</span>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`${nameOf(id)} を治療計画から取り消す`}
                  title="この質問票を、治療計画から取り消す(配信をすべて外す)"
                  onClick={() => removeQuestionnaire(id)}
                >
                  <Icon name="trash" />
                </button>
              </div>
              <div className="track drawable" style={trackStyle} {...trackProps} {...drawProps(id, id)}>
                {zones}
                {drawPreview(id)}
                {rules.map((rule, index) =>
                  rule.questionnaireId !== id ? null : (
                    <div
                      key={index}
                      className={`bar${rule.dayOffset < 0 ? ' baseline' : ''}${selected === index ? ' selected' : ''}`}
                      style={{
                        left: (rule.dayOffset + baseline) * DAY_WIDTH + 1,
                        width: rule.windowDays * DAY_WIDTH - 2,
                        // ベースラインの配信は、質問票の色ではなく、ベースラインの色で塗る(CSS)
                        background: rule.dayOffset < 0 ? undefined : colorOf(id),
                      }}
                      role="button"
                      tabIndex={0}
                      title={`${nameOf(id)}: ${rule.dayOffset < 0 ? `開始 ${-rule.dayOffset} 日前` : `${rule.dayOffset + 1} 日目`}から ${rule.windowDays} 日間・${cyclesLabel(rule)}`}
                      onPointerDown={(e) => onBarPointerDown(e, index, 'move')}
                      onPointerMove={onBarPointerMove}
                      onPointerUp={onBarPointerUp}
                      onPointerCancel={onBarPointerUp}
                      onFocus={() => setSelected(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Delete' || e.key === 'Backspace') removeRule(index);
                        if (e.key === 'ArrowLeft') replaceRule(index, { ...rule, dayOffset: rule.dayOffset - 1 });
                        if (e.key === 'ArrowRight') replaceRule(index, { ...rule, dayOffset: rule.dayOffset + 1 });
                      }}
                    >
                      <span className="bar-text">{cyclesLabel(rule)}</span>
                      <button
                        type="button"
                        className="bar-remove"
                        aria-label={`${nameOf(id)} の配信を外す`}
                        title="この配信を外す"
                        // バーのドラッグを始めさせない
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => removeRule(index)}
                      >
                        <Icon name="close" size={11} />
                      </button>
                      <span
                        className="bar-handle"
                        title="ドラッグして回答可能期間を変える"
                        onPointerDown={(e) => onBarPointerDown(e, index, 'resize')}
                        onPointerMove={onBarPointerMove}
                        onPointerUp={onBarPointerUp}
                        onPointerCancel={onBarPointerUp}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
          <div className="board-row">
            <div className="board-label">
              <select
                className="add-questionnaire"
                aria-label="質問票を追加"
                value=""
                disabled={questionnaires.every((q) => rowIds.includes(q.id))}
                onChange={(e) => e.target.value && addQuestionnaire(e.target.value)}
              >
                <option value="">
                  {questionnaires.length === 0
                    ? '質問票マスタが空'
                    : questionnaires.every((q) => rowIds.includes(q.id))
                      ? 'すべて追加済み'
                      : '+ 質問票を追加…'}
                </option>
                {questionnaires
                  .filter((q) => !rowIds.includes(q.id))
                  .map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="track dropzone" style={trackStyle} {...trackProps}>
              {zones}
              <span className="track-note">左のリストから質問票を選ぶと、行が増える(ベースラインの配信が付く)。配信は、その行でドラッグして描く</span>
            </div>
          </div>
        </div>

        {selectedRule && selected !== null ? (
          <div className="rule-panel">
            <strong>{questionnaireLink(selectedRule.questionnaireId)}</strong>
            <label className="inline">
              配信日
              <select
                value={selectedRule.dayOffset}
                onChange={(e) => replaceRule(selected, { ...selectedRule, dayOffset: Number(e.target.value) })}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d < 0 ? `治療開始の ${-d} 日前` : `${d + 1} 日目`}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline">
              回答可能期間
              <input
                type="number"
                min={1}
                value={selectedRule.windowDays}
                onChange={(e) => replaceRule(selected, { ...selectedRule, windowDays: Number(e.target.value) || 1 })}
              />
              日間
            </label>
            {selectedRule.dayOffset < 0 ? (
              <span className="badge baseline">ベースライン: 治療開始前に 1 回だけ配信する</span>
            ) : (
              <>
                <label className="inline">
                  対象
                  <input
                    type="number"
                    min={1}
                    max={cycleCount}
                    value={selectedRule.cycleFrom}
                    onChange={(e) => replaceRule(selected, { ...selectedRule, cycleFrom: clamp(Number(e.target.value) || 1, 1, cycleCount) })}
                  />
                  コース目から
                </label>
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={selectedRule.cycleTo === null}
                    onChange={(e) => replaceRule(selected, { ...selectedRule, cycleTo: e.target.checked ? null : cycleCount })}
                  />
                  最後のコースまで
                </label>
                {selectedRule.cycleTo !== null && (
                  <label className="inline">
                    <input
                      type="number"
                      min={selectedRule.cycleFrom}
                      max={cycleCount}
                      value={selectedRule.cycleTo}
                      onChange={(e) =>
                        replaceRule(selected, { ...selectedRule, cycleTo: clamp(Number(e.target.value) || 1, 1, cycleCount) })
                      }
                    />
                    コース目まで
                  </label>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="hint">
          質問票の行の空いたところをドラッグすると、配信を描ける。行は、左端のつまみをドラッグして並べ替える。バーは左右に動かせ、右端のドラッグで回答可能期間が変わる。バーの丸い印
          で外す。質問票ごと取り消すときは、行のゴミ箱。バーをクリックすると、配信日・回答可能期間・対象のコースを数値で調整できる。
        </p>
        )}
      </div>
    </div>
  );
}
