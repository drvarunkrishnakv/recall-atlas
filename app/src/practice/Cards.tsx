// Flashcards (the chosen design: Flashcards 1 · Classic stack). A tall card with its subject's
// colour on top and the next ones peeking behind. Type your answer in the box below and flip (an
// empty answer flips too); the back shows the answer, how your typing compares and the grade it
// suggests. Fling the card right for Knew it or left for Forgot, or press Hard / Easy. Cards due
// for review come first (FSRS), then new ones. Keys: Enter flips, ← / → grade, 1–4 grade.
// ?banks=a,b picks the topics, ?n= the number of cards, ?items= a chosen set.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { recordAttempt, usePractice } from "../content/practice";
import { planSession } from "../lib/srs";
import { servable, type Attempt, type FlashcardItem } from "../lib/practice";
import {
  backIn,
  CARD_GRADE,
  CARD_GRADE_LABEL,
  CARD_STYLE_LABEL,
  checkTyped,
  clozeParts,
  type CardGrade,
  type TypedCheck,
} from "../lib/flashcards";
import { Picture } from "./Picture";
import { prefersReducedMotion, subjectColour } from "./feedback";
import "../prelims/prelims.css";
import "./practice.css";

const FLING_MS = 350;
const FLING_AT = 110;
const KEYS: Record<string, CardGrade> = {
  arrowleft: "forgot",
  arrowright: "knew",
  "1": "forgot",
  "2": "hard",
  "3": "knew",
  "4": "easy",
};

export default function Cards() {
  const [params] = useSearchParams();
  const practice = usePractice();
  const size = Math.min(200, Math.max(1, Number(params.get("n")) || 20));
  const bankIds = (params.get("banks") ?? "").split(",").filter(Boolean);
  const itemIds = (params.get("items") ?? "").split(",").filter(Boolean);
  const [plan, setPlan] = useState<FlashcardItem[] | null>(null);
  const [round, setRound] = useState(0);

  // The deck is fixed when it starts, so grading doesn't reshuffle it.
  useEffect(() => {
    if (practice.status !== "ready" || plan) return;
    if (itemIds.length) {
      setPlan(
        itemIds
          .map((id) => practice.items.get(id))
          .filter((i): i is FlashcardItem => !!i && i.kind === "flashcard" && servable(i))
          .slice(0, size),
      );
      return;
    }
    const banks = bankIds.length ? practice.banks.filter((b) => bankIds.includes(b.id)) : practice.banks;
    setPlan(planSession(banks, practice.states, size, "flashcard").items as FlashcardItem[]);
  }, [practice.status, practice.banks, practice.states, practice.items, plan, bankIds, itemIds, size]);

  useEffect(() => {
    document.title = "Flashcards · Mains Atlas";
  }, []);

  if (practice.status === "error")
    return (
      <article className="fc-page">
        <p className="loading">Couldn't load practice: {practice.error}</p>
      </article>
    );
  if (!plan)
    return (
      <article className="fc-page">
        <p className="loading">Loading cards…</p>
      </article>
    );
  if (!plan.length)
    return (
      <article className="fc-page fc-empty">
        <h1>No cards to review now</h1>
        <p className="muted">
          {round
            ? "Every card in this deck is scheduled for later. Cards you forgot come back in a few minutes."
            : "No flashcard here is due, and none is new. Cards are added once they have been fact-checked."}
        </p>
        <Link className="board-btn" to="/prelims">
          Back to Prelims
        </Link>
      </article>
    );
  return (
    <Deck
      key={round}
      items={plan}
      onAgain={() => {
        setPlan(null);
        setRound((r) => r + 1);
      }}
    />
  );
}

interface Result {
  item: FlashcardItem;
  grade: CardGrade;
}

function Deck({ items, onAgain }: { items: FlashcardItem[]; onAgain: () => void }) {
  const practice = usePractice();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [check, setCheck] = useState<TypedCheck | null>(null);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<{
    index: number;
    dir: "left" | "right";
    typed: string;
    check: TypedCheck | null;
    ticks: boolean[];
  } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const drag = useRef<{ x: number; id: number; captured: boolean } | null>(null);
  const startedAt = useRef(Date.now());
  const flyTimer = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => window.clearTimeout(flyTimer.current), []);
  // Each card's review state before this deck, for "back in …" on the buttons.
  const [before] = useState(() => new Map(items.map((i) => [i.id, practice.states.get(i.id)?.card])));
  const subjects = useMemo(() => new Map(practice.banks.map((b) => [b.id, b.subject])), [practice.banks]);
  const done = index >= items.length;
  const item = items[index];

  useEffect(() => {
    startedAt.current = Date.now();
    if (!done && matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, [index, done]);

  function flip() {
    if (flipped || done) return;
    const c = checkTyped(item, typed);
    setCheck(c);
    setTicks(c.hits ?? (item.list ?? []).map(() => false));
    setFlipped(true);
  }

  function grade(g: CardGrade) {
    if (!flipped || done) return;
    const attempt: Attempt = {
      id: `${item.id}-${Date.now().toString(36)}`,
      itemId: item.id,
      bank: item.bank,
      kind: "flashcard",
      at: new Date().toISOString(),
      ms: Date.now() - startedAt.current,
      mode: "practice",
      correct: g !== "forgot",
      grade: CARD_GRADE[g],
      typed: typed.slice(0, 2000),
    };
    recordAttempt(attempt);
    setResults((r) => [...r, { item, grade: g }]);
    // The graded card flies off while the next one slides forward.
    setFlying({ index, dir: g === "forgot" ? "left" : "right", typed, check, ticks });
    window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => setFlying(null), prefersReducedMotion() ? 0 : FLING_MS);
    setDx(0);
    setDragging(false);
    drag.current = null;
    setFlipped(false);
    setTyped("");
    setCheck(null);
    setIndex(index + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !flipped) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      const g = KEYS[e.key.toLowerCase()];
      if (g) {
        e.preventDefault();
        grade(g);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function onDown(e: ReactPointerEvent) {
    if (!flipped || e.button !== 0) return;
    drag.current = { x: e.clientX, id: e.pointerId, captured: false };
  }
  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const moved = e.clientX - d.x;
    // Only a real drag takes the pointer, so a tap on a list item still ticks it.
    if (!d.captured && Math.abs(moved) > 6) {
      d.captured = true;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone.
      }
    }
    if (d.captured) setDx(moved);
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.captured) return;
    setDragging(false);
    if (dx > FLING_AT) grade("knew");
    else if (dx < -FLING_AT) grade("forgot");
    else setDx(0);
  }

  if (done && !flying) return <Summary results={results} onAgain={onAgain} />;

  const now = new Date();
  const card = before.get(item?.id ?? "");
  const later = (g: CardGrade) => (item ? backIn(g, card, now) : "");
  const shown = [flying?.index, index, index + 1, index + 2].filter(
    (i): i is number => i !== undefined && i >= 0 && i < items.length,
  );

  return (
    <article className="fc-page" aria-label="Flashcards">
      <header className="pc-head">
        <Link className="pc-x" to="/prelims" aria-label="Leave flashcards">
          <Icon name="close" />
        </Link>
        <span className="pc-title">Flashcards</span>
        <div className="fc-bar" aria-hidden="true">
          <span style={{ width: `${(Math.min(index, items.length) / items.length) * 100}%` }} />
        </div>
        <span className="fc-left">{Math.max(0, items.length - index)} left</span>
      </header>

      <div className="fc-stage">
        <div className="fc-stack">
          {shown.map((i) => {
            const it = items[i];
            const off = i - index;
            const isFlying = flying?.index === i;
            const isNow = off === 0 && !isFlying;
            const cls = isFlying ? `fly-${flying.dir}` : off === 0 ? "now" : `off${off}`;
            return (
              <div
                key={it.id + i}
                className={`fc-card ${cls}${isNow && flipped ? " flipped" : ""}${isFlying ? " flipped" : ""}${isNow && dragging ? " dragging" : ""}`}
                style={
                  isNow && dx ? { transform: `translateX(${dx}px) rotate(${(dx / 22).toFixed(1)}deg)` } : undefined
                }
                aria-hidden={!isNow}
                role={isNow ? "region" : undefined}
                aria-label={isNow ? `Card ${index + 1} of ${items.length}` : undefined}
                onPointerDown={isNow ? onDown : undefined}
                onPointerMove={isNow ? onMove : undefined}
                onPointerUp={isNow ? onUp : undefined}
                onPointerCancel={isNow ? onUp : undefined}
              >
                <div className="fc-inner">
                  <Front item={it} subject={subjects.get(it.bank)} />
                  {isFlying ? (
                    <Back
                      item={it}
                      subject={subjects.get(it.bank)}
                      typed={flying.typed}
                      check={flying.check}
                      ticks={flying.ticks}
                      onTick={() => {}}
                    />
                  ) : isNow && flipped ? (
                    <Back
                      item={it}
                      subject={subjects.get(it.bank)}
                      typed={typed}
                      check={check}
                      ticks={ticks}
                      onTick={(k) => setTicks(ticks.map((t, j) => (j === k ? !t : t)))}
                    />
                  ) : (
                    <div className="fc-face back" />
                  )}
                </div>
                {isNow && dragging && Math.abs(dx) > 20 && (
                  <span
                    className={`fc-stamp ${dx > 0 ? "right" : "left"}`}
                    style={{ opacity: Math.min(1, Math.abs(dx) / FLING_AT) }}
                  >
                    {dx > 0 ? "Knew it" : "Forgot"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!done &&
        (!flipped ? (
          <form
            className="fc-answer"
            onSubmit={(e) => {
              e.preventDefault();
              flip();
            }}
          >
            <label htmlFor="fc-typed" className="sr-only">
              Your answer
            </label>
            <input
              id="fc-typed"
              ref={input}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={typed}
              maxLength={2000}
              placeholder={item.style === "list" ? "Name as many as you can" : "Your answer"}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button type="submit" className="board-btn">
              Flip <kbd>Enter</kbd>
            </button>
          </form>
        ) : (
          <div className="fc-grades">
            <div className="fc-main-grades">
              <button
                type="button"
                className={`fc-grade forgot${check?.suggest === "forgot" ? " suggested" : ""}`}
                onClick={() => grade("forgot")}
              >
                ← {CARD_GRADE_LABEL.forgot}
                <span>{later("forgot")}</span>
              </button>
              <button
                type="button"
                className={`fc-grade knew${check?.suggest === "knew" ? " suggested" : ""}`}
                onClick={() => grade("knew")}
              >
                {CARD_GRADE_LABEL.knew} →<span>{later("knew")}</span>
              </button>
            </div>
            <div className="fc-small-grades">
              {(["hard", "easy"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`chip-btn${check?.suggest === g ? " suggested" : ""}`}
                  onClick={() => grade(g)}
                >
                  {CARD_GRADE_LABEL[g]} · {later(g).replace(/^back (in )?/, "")}
                </button>
              ))}
            </div>
            <span className="fc-hint">Or drag the card left or right</span>
          </div>
        ))}
      {practice.saveError && <p className="s-error">{practice.saveError}</p>}
    </article>
  );
}

function CardTop({ item, subject }: { item: FlashcardItem; subject?: string }) {
  return (
    <>
      <div className="fc-strip" aria-hidden="true" style={{ background: subjectColour(subject) }} />
      <div className="fc-meta">
        <span>
          {subject ? `${subject} · ` : ""}
          {item.topic}
        </span>
        <span>{CARD_STYLE_LABEL[item.style]}</span>
      </div>
    </>
  );
}

function Front({ item, subject }: { item: FlashcardItem; subject?: string }) {
  const parts = item.style === "cloze" ? clozeParts(item.front) : [item.front];
  return (
    <div className="fc-face front">
      <CardTop item={item} subject={subject} />
      <div className="fc-body">
        {item.style === "image" && item.image && <Picture src={item.image} alt={item.alt ?? ""} className="fc-img" />}
        <p className="fc-front">
          {parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < parts.length - 1 && (
                <span className="fc-blank" aria-label="blank">
                  ______
                </span>
              )}
            </span>
          ))}
        </p>
        <span className="fc-tip">Type your answer below, then flip</span>
      </div>
    </div>
  );
}

function Back({
  item,
  subject,
  typed,
  check,
  ticks,
  onTick,
}: {
  item: FlashcardItem;
  subject?: string;
  typed: string;
  check: TypedCheck | null;
  ticks: boolean[];
  onTick: (k: number) => void;
}) {
  const parts = item.style === "cloze" ? clozeParts(item.front) : [];
  const named = ticks.filter(Boolean).length;
  let you = "";
  let tone = "";
  if (check?.empty) {
    you = "You didn't type an answer";
  } else if (check && item.style === "list" && item.list) {
    you = `You named ${named} of ${item.list.length}: “${typed}”`;
    tone = named === item.list.length ? "ok" : named ? "part" : "bad";
  } else if (check) {
    const how = { match: "matches", partial: "partly matches", miss: "doesn't match" }[check.verdict ?? "miss"];
    you = `You wrote “${typed}”: ${how}`;
    tone = { match: "ok", partial: "part", miss: "bad" }[check.verdict ?? "miss"];
  }
  const source =
    item.source.type === "pyq"
      ? `UPSC Prelims ${item.source.year}`
      : item.source.sources.map((s) => s.label).join("; ") + (item.source.checked ? "" : " · not fact-checked");
  return (
    <div className="fc-face back">
      <CardTop item={item} subject={subject} />
      <div className="fc-body back">
        <span className="fc-label">Answer</span>
        {item.style === "list" && item.list ? (
          <>
            <p className="fc-sum">{item.back}</p>
            <ul className="fc-list">
              {item.list.map((l, k) => (
                <li key={k} style={{ animationDelay: `${k * 70}ms` }}>
                  <button
                    type="button"
                    className={ticks[k] ? "on" : ""}
                    aria-pressed={!!ticks[k]}
                    onClick={() => onTick(k)}
                  >
                    <span className="mark" aria-hidden="true">
                      {ticks[k] ? "✓" : "✕"}
                    </span>
                    {l}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="fc-ans">{item.back}</p>
        )}
        {parts.length > 1 && (
          <p className="fc-filled">
            {parts.map((p, i) => (
              <span key={i}>
                {p}
                {i < parts.length - 1 && <mark>{item.back}</mark>}
              </span>
            ))}
          </p>
        )}
        {you && <div className={`fc-you ${tone}`}>{you}</div>}
        {item.why && <p className="fc-why">{item.why}</p>}
        <span className="fc-src">Source: {source}</span>
      </div>
    </div>
  );
}

function Summary({ results, onAgain }: { results: Result[]; onAgain: () => void }) {
  const knew = results.filter((r) => r.grade !== "forgot").length;
  const forgot = results.length - knew;
  const shaky = results.filter((r) => r.grade === "forgot" || r.grade === "hard").length;
  return (
    <article className="fc-page">
      <section className="board-card fc-done" aria-label="Deck done">
        <h1>Deck done</h1>
        <div className="fc-tiles">
          <div>
            <b className="up">{knew}</b>
            <span>knew</span>
          </div>
          <div>
            <b className="down">{forgot}</b>
            <span>forgot · back in a few minutes</span>
          </div>
        </div>
        <p>
          {shaky
            ? `${shaky} ${shaky === 1 ? "card was" : "cards were"} shaky. Those come back sooner; the rest return in days.`
            : "Every card was solid. They return in days, spaced further each time."}
        </p>
        <div className="fc-done-actions">
          <button type="button" className="board-btn" onClick={onAgain}>
            Another round
          </button>
          <Link className="board-btn quiet" to="/prelims">
            Back to Home
          </Link>
        </div>
      </section>
    </article>
  );
}
