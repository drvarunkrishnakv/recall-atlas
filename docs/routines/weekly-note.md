# Routine: the weekly note

A prompt for Claude's run at the end of each week (M9). It is written down here only.
Nothing schedules it yet: the user turns it on when they are ready.

The weekly note sits on top of the Prelims Analytics screen (Analytics 3 · The week's
story, M11). It is a few plain lines on how the week went. Each line links to the screen
that shows its evidence, so the user can check every claim in one tap.

The same note carries the Mains lines (M11). A line whose evidence route starts with
`/prelims` shows on Prelims Analytics; any other line (`/mains/analytics#checklist`,
`/mains/feedback`, `/notes/P06`…) shows on Mains Analytics (MAna-1 · The week's story).

## Hard rules

- **Never use CA Tracker Pro content.** Its terms forbid automated access and feeding it to
  any AI. The note is about the user's own practice, so it needs nothing from outside the
  app.
- **Never show a fact as checked unless it was checked.** Every number in the note comes
  from `week-data` exactly as printed. If you say anything about a law, scheme or date,
  check it against a primary source first, or leave it out.
- Every line has its evidence: an app route and a short label. No line without one.
- Plain teaching prose (docs/STYLE_GUIDE.md). No praise, streaks or scores beyond the
  agreed rating, and no predicted marks until the user has sat three full mocks.
- Never write the note into this public repo. It goes only into the app's data through the
  CLI.

## Steps

All commands run from `app/`. Without `ATLAS_CONTENT_DIR` the CLI works on Firestore, as the
deployed app does.

1. **Read the week's facts.**

   ```
   node cli/atlas.ts week-data [--weeks 1]
   ```

   It prints JSON for this ISO week (and earlier ones with `--weeks 2` or more, for
   comparison):
   - `answered`, `right`, `accuracy` and `byMode` (practice, exam, quiz);
   - `calibration`: accuracy when sure and when unsure, and the number of confident misses;
   - `time`: average and median seconds per question, and how many ran past 72 s;
   - `missReasons`: the grade buttons pressed on misses;
   - `missesByTopic` and `missesByMicrotheme`;
   - `lessons`: lesson days, cards, cards not fact-checked, and "got" or "shaky" ratings;
   - `quiz`: morning quiz answers and how many were right;
   - `evidence`: routes the lines can link to;
   - `due`: the FSRS load due now and over the next seven days;
   - `shakyDue`: lesson cards still shaky;
   - `mains` (in each week): Mains answers sent and marked that week, their average score, the
     self-score gap (above 0: too generous), the average 10-marker time against 7:00, answers
     that ran over, the checklist item that cost the most, the daily target, the marks still
     open per paper, and `evidence` routes on Mains Analytics (`/mains/analytics#scores`,
     `#checklist`, `#self-score`, `#time`, `#volume`, `#open`) and `/mains/feedback`.

2. **Write three to six lines.** Each line says one thing the user can act on, with its
   number, and why it matters. For example:
   - where most misses fell, against the topic's weight in Prelims;
   - calibration: whether "sure" answers were right more often than "unsure" ones, and the
     guessing rule that follows (a guess pays on average when p > 0.25);
   - time: questions past 72 s and where they were;
   - the review load due next week against the time the user has;
   - concepts still shaky after their lessons.

   When `mains` shows answers that week, add one to three Mains lines the same way: the
   checklist item that cost the most, how far self-scores were off, time against 7:00, or
   answers written against the target. No predicted Mains score until two full papers are
   marked.

   Compare with last week only when `--weeks 2` gives a real difference. Leave out anything
   the facts don't show.

3. **Tie each line to its evidence.** Use a route from `evidence`, or another app route that
   shows the claim, such as `/prelims/notebook?filter=confident`,
   `/prelims/notebook?filter=shaky` or `/prelims/lesson?day=YYYY-MM-DD`. Give it a short
   label of up to 80 characters, such as "Confident misses".

4. **Write the note.** Save it as JSON in a scratch file outside the repo:

   ```json
   {
     "lines": [
       {
         "text": "One plain line with its number.",
         "evidence": { "route": "/prelims/notebook?filter=week", "label": "This week's misses" }
       }
     ]
   }
   ```

   Then store it under the ISO week it describes:

   ```
   node cli/atlas.ts week-note YYYY-Www note.json
   ```

   The CLI checks that every line has its text and its evidence, and refuses a route that
   isn't an app route.

5. **Report.** In the run's summary, give the week and the lines.

## Check before writing

- [ ] Every number is copied from `week-data`.
- [ ] Every line has an app route and a short label as its evidence.
- [ ] Nothing from CA Tracker Pro, and no unchecked fact presented as checked.
