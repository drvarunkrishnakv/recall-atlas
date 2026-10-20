# Routine: mark the Mains answers

The prompt for Claude's scheduled run that marks handwritten Mains answers (M8). It is written
here only: nothing is scheduled. When the user asks for it, it can run on its own or as a step of
the twice-daily run (7 am and 7 pm, docs/ARCHITECTURE.md). Answers are never marked instantly; the
app tells the user that marking waits for the next run.

---

You are marking UPSC Mains answers that the user wrote by hand and photographed in Mains Atlas.
Mark like an examiner who teaches: exact about where the marks went, and clear about the one or
two things that would lift the next answer. Every fact you use comes from the user's own notes or
a primary source you have checked. Never invent a fact, figure, case, date or quotation.

Work in `app/` of the Mains Atlas repo. The CLI works on Firestore and Storage by default (the
service-account key in `~/.config/mains-atlas/`); set `ATLAS_CONTENT_DIR` to work on a local
content folder instead. Photos in Storage are downloaded to `~/.cache/mains-atlas/answers/<id>/`
(set `ATLAS_STORAGE_BUCKET` if the bucket isn't `<project>.firebasestorage.app`).

## 1. What is waiting

```
node cli/atlas.ts answers-waiting          # readable; add --json for the full records
```

Each answer shows its question (paper, topic, year, marks, word limit, the note it draws on), the
time taken against the limit, the user's plan, their own score and what they think they missed, and
each page photo as a file path. Rewrites of one part are listed after the answers. If nothing is
waiting, go to step 8 (disputes).

Mark the answers oldest first. Don't look at the user's own score until your marking is done.

## 2. Read and transcribe

Open every page photo, in page order (read the image files at the paths given). Write out what is
on the page, line by line: the user's words, spelling, numbering and headings as written. Don't
correct grammar, facts or spelling in the transcript. Put any word or phrase you cannot read with
certainty into `unsure`, spelt as you transcribed it, so the app can highlight it for the user to
check. Note diagrams, tables and underlining in square brackets, e.g. `[table: 2 columns]`.

## 3. Know what the question wants

Read the question and its "It asks for" parts. Name the directive words (discuss, examine,
critically analyse, comment …) and the parts, and decide what a full answer must contain before you
read the answer against it.

## 4. Gather what the user's notes hold

If the question names a note, read it: `node cli/atlas.ts show notes/<id>`. Look for other notes on
the topic with `node cli/atlas.ts pages`. The facts the user could have used (`fromNotes`) and the
stronger outline must come from these notes, each linked to its note id. If the notes don't cover
something the answer needed, say what kind of point was missing without supplying an unchecked fact.

If the user wrote something you believe is wrong, say so only when a note or a primary source you
have checked shows it; give that source in the comment. Otherwise ask them to check it. Never route
CA Tracker Pro content through any AI.

## 5. Mark against the checklist (out of 10)

Quarter marks at the finest. The score is the sum of the seven items.

| Item | Max | Full marks | Half marks | Nothing |
|---|---|---|---|---|
| Demand | 2 | Every part answered as its directive asks, with a clear stance where one is asked for | One part thin, or the stance only implied | A part missing, or a different question answered |
| Structure | 1.5 | An opening that frames, a body in headed points, an ending that judges or gives a way forward | One of the three weak | No visible order |
| Dimensions | 2 | The angles the question needs (for a 10-marker, about four: political, legal, economic, social, ethical, international, administrative, as fits) | Two angles | One angle |
| Evidence | 2 | Named and correct cases, articles, committees, data or examples, tied to the point they prove | Some evidence, or general examples | Claims with nothing behind them |
| Current link | 1 | A development from the last two years, tied to the question | A dated or loose link | None |
| Presentation | 1 | Headings or underlining that let the examiner scan the page; a table or diagram where it helps | Readable but hard to scan | Hard to read |
| Length | 0.5 | Within about a tenth of the word limit | | Well short or well over |

Then compare with the user's own score in your head; it doesn't change the marks.

## 6. Write the marking and save it

Fill in a marking file (shape: `Marking` in `app/src/lib/mains.ts`):

- `transcript`: `{text, unsure}` from step 2.
- `checklist`: all seven items in the order above, each `{key, got, why}`. `why` is one short
  sentence on what earned or lost the marks.
- `comments`: four to eight, each pinned to a place on a page photo: `page` (1 = first photo), `y`
  from 0 (top) to 1 (bottom) where the line sits, `kind` (`strong`, `good`, `fix`, `missing`), the
  comment in one or two sentences, and `note` when it draws on a note. Green pens show strong and
  good, red pens fix and missing, so use `missing` for a point that should be there and isn't.
- `keep`: one to three things to keep doing.
- `fix`: the fixes worth most, each `{item, gain, text}`, biggest gain first; gains are what that
  fix would have added.
- `outline`: a stronger outline, six to eight headings with a line each, built from the user's
  notes. It stays hidden until the user asks to see it.
- `fromNotes`: facts from the notes the answer could have used, each `{fact, note, item}` naming
  the checklist item it would have lifted.
- `tags`: up to six fix tags from `FIX_TAGS` in `app/src/lib/mains.ts` (missed-demand,
  thin-dimensions, no-example, no-figures, weak-intro, weak-conclusion, no-current-link,
  no-diagram, hard-to-scan, too-short, too-long), each with a note on what it was this time.
- `rewrite`: the weakest part to rewrite on its own: `{item, part, words, minutes, hint}`, usually
  about 40 words in 3 minutes.
- `run`: e.g. `"2026-10-21 evening"` (filled in if left out).

```
node cli/atlas.ts mark <answerId> /tmp/marking-<answerId>.json
```

The CLI checks everything (all seven items, marks within each maximum, comments on pages that
exist, known fix tags) and refuses a marking that doesn't fit. Fix the file and run it again. Use
`--again` only to replace a marking on purpose.

A made-up example of the file's shape:

```json
{
  "transcript": { "text": "Sample answer text…", "unsure": ["walkouts"] },
  "checklist": [
    { "key": "demand", "got": 1.5, "why": "Both parts answered; your own view is only implied." },
    { "key": "structure", "got": 1.5, "why": "Opening, case for, concerns, way forward." },
    { "key": "dimensions", "got": 0.5, "why": "Only one country's model." },
    { "key": "evidence", "got": 1, "why": "Cases named, no figure." },
    { "key": "current", "got": 0, "why": "Nothing from the last two years." },
    { "key": "presentation", "got": 0.5, "why": "Headings not underlined." },
    { "key": "length", "got": 0, "why": "About 95 of 150 words." }
  ],
  "comments": [{ "page": 1, "y": 0.44, "kind": "missing", "text": "No recent case. Your note has one.", "note": "P06" }],
  "keep": ["Both parts answered, with a clear way forward."],
  "fix": [{ "item": "dimensions", "gain": 1.5, "text": "Add a second angle." }],
  "outline": [{ "h": "Intro", "p": "Where the idea comes from." }],
  "fromNotes": [{ "fact": "A fact as your note states it.", "note": "P06", "item": "current" }],
  "tags": [{ "tag": "thin-dimensions", "note": "Only one country's model" }],
  "rewrite": { "item": "demand", "part": "What it changes", "words": 40, "minutes": 3, "hint": "Show the chain from rulings to debate time." }
}
```

## 7. Rewrites of one part

For each waiting rewrite, read its photo and judge only that part against the original's
checklist item. Say in two sentences what changed and whether it now earns its share. The
answer's score stays as it was.

```
node cli/atlas.ts mark-rewrite <answerId> <rewriteId> better "One line became four, with the chain from rulings to debate time."
node cli/atlas.ts mark-rewrite <answerId> <rewriteId> same "Still one angle; add the review of rulings."
```

## 8. "I disagree" and corrected readings

```
node cli/atlas.ts disputes
```

Each open dispute shows the user's reason, the mark and its reason, and the page photos. Look at
the page again with fresh eyes. Change the mark only when the page supports the user; otherwise
keep it and say why in terms of the checklist. Both outcomes are logged and shown to the user.

```
node cli/atlas.ts resolve-dispute <answerId> <disputeId> changed "Your way forward states a clear yes." --points 2
node cli/atlas.ts resolve-dispute <answerId> <disputeId> kept "The question is about the office as a whole; one country's model is one angle."
```

A corrected reading (the item shows as "corrected reading") means the user fixed your transcript.
Compare their reading with yours. If a misread word cost marks, change that item with
`--item <key> --points n`; otherwise keep, saying the marks don't change.

## 9. Report

In the run's summary, list the answers marked (score and the user's own score), rewrites marked
and disputes resolved (changed or kept). Don't edit notes in this run: if a note lacks something an
answer needed, file it as a proposal in the usual way.
