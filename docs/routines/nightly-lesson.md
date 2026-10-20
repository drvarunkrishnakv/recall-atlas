# Routine: tonight's lesson and tomorrow's quiz

A prompt for Claude's evening run (M9). It is written down here only. Nothing schedules it
yet: the user turns it on when they are ready (DECISIONS 2026-10-20, the engine's second layer).

The user reads the lesson in the evening and takes the quiz the next morning (Mazza et al.
2016). The lesson is one card per concept, built around their own mistakes of the day.

## Hard rules

- **Never use CA Tracker Pro content.** Its terms forbid automated access and feeding it to
  any AI. Don't read it, search it, quote it or use the `tracker_current_affairs` index.
  Use sources that allow reuse: the Constitution, Acts, rules, judgments, PIB, PRS, RBI,
  ministry and commission reports, NCERT and standard books.
- **Never show a fact as checked unless it was checked.** A card's `checked` is `true` only
  after the blind fact-check below passed every claim on it. If any claim fails or can't be
  verified, fix it, drop it, or leave the card with `checked: false`. The app then shows
  "Not fact-checked" on it. Never guess.
- Teach. Don't list bare facts. Every card explains the concept around the mistake in a
  few clear paragraphs, in the voice of docs/STYLE_GUIDE.md.
- Never write lesson content into this public repo. It goes only into the app's data through
  the CLI.

## Steps

All commands run from `app/`. Without `ATLAS_CONTENT_DIR` the CLI works on Firestore, as the
deployed app does. With `ATLAS_CONTENT_DIR=../output/notes-pilot/content` it works on the
local content folder instead.

1. **Read the day's misses.**

   ```
   node cli/atlas.ts misses [--day YYYY-MM-DD]
   ```

   It prints JSON. `misses` holds every MCQ the user got wrong that day, and every right
   answer they weren't sure of ("unsure" or "Guessed"). Each one has:
   - the question, its statements and their truth, the options and the answer;
   - the user's ✓/✕ marks, chosen option, sure or unsure, miss reason and time taken;
   - `mistake`, the "your mistake" block, ready to copy into a card;
   - earlier misses of the same item, and of other items in the same microtheme;
   - `cards`, lesson cards that already teach this item;
   - `quizCandidates`, checked PYQs from the same microtheme.

   `shakyDue` lists cards the user called "Still shaky" that are due back.

   If there are no misses and nothing is due back, write no lesson and stop.

2. **Group the misses by concept.** One card per concept, not per question. Two questions
   that turn on the same idea share a card, and the card lists both item ids and both
   mistakes. Put confident misses first: they teach the most. If a concept already has a
   card (`cards`), reuse its `id`, so ratings follow the concept across lessons. Otherwise
   make a new id from the concept, in lowercase words joined by dashes, e.g.
   `money-bill-rajya-sabha`.

3. **Teach each concept.**
   - **Your mistake:** copy `mistake` from `misses` as it is. It shows the slipped
     statement with the user's mark against the truth, their option against the answer,
     and whether they were sure.
   - **Teaching paragraphs (`teach`):** two to four short paragraphs. Start from what the
     user got wrong and why the right answer is right. Then give the idea around it: the
     rule, its source in law, how it works, and the usual trap. One idea per sentence.
   - **Comparison table (`table`):** add one where facts are easily confused, such as two
     bodies, two Articles, two procedures, or the UK against India. Keep it to two to five
     columns and a few rows. Leave it out when nothing is confusable.
   - **Remember (`remember`):** one line the user can carry into the exam hall.
   - **Sources (`sources`):** cite primary sources with labels and links: the Article, the
     Act or rule, the judgment, the PIB or PRS page, the official report.

   Draft the way the project drafts notes: book RAG for the core, plain web research that
   prefers primary sources, judgment details read from the judgment texts, and figures from
   official data series, never Wikipedia.

4. **Fact-check blind.** Hand each card to a separate checker that sees only the card's
   claims and its sources, not how they were drafted. The checker verifies every claim
   (each fact, number, date, Article and holding) against a primary source, claim by claim.
   - Set `checked: true` only when every claim on the card passed.
   - Fix or remove a claim that failed, then check the card again.
   - If a claim can't be verified tonight, either remove it or keep the card with
     `checked: false`.

5. **Bring shaky cards back.** `lesson-write` adds every card in `shakyDue` to the end of
   the lesson by itself, marked as coming back. A card leaves the queue once the user
   calls it "Got it" on two different later days. If tonight's misses touch one of those
   concepts again, write a fresh card with the same id instead. The new version replaces
   the old one, and it needs its own fact-check.

6. **Pick the morning quiz (`quiz`): 5 to 10 item ids.** Start with the day's missed items.
   Add related checked PYQs from `quizCandidates` until the quiz has 5 to 10 questions.
   Prefer items from the same microtheme that test the same idea from another side. When
   fewer exist, a shorter quiz is fine. The CLI refuses any item a session may not serve,
   such as a PYQ whose key isn't verified.

7. **Write the lesson.** Save it as JSON in a scratch file outside the repo:

   ```json
   {
     "cards": [
       {
         "id": "concept-id",
         "concept": "The heading",
         "subject": "Polity · Parliament",
         "itemIds": ["…"],
         "mistakes": ["… copied from misses …"],
         "teach": ["Paragraph one.", "Paragraph two."],
         "table": { "head": ["", "A", "B"], "rows": [["Row", "…", "…"]] },
         "remember": "One line.",
         "sources": [{ "label": "Constitution of India, Art. 110", "url": "https://…" }],
         "checked": true
       }
     ],
     "quiz": ["…"]
   }
   ```

   Then store it:

   ```
   node cli/atlas.ts lesson-write YYYY-MM-DD lesson.json
   ```

   The CLI checks the shape, the item ids and the quiz. It keeps any ratings the user
   already gave on that day's cards and adds the shaky cards due back. It then prints how
   many cards it stored, how many are not fact-checked and how many came back.

8. **Report.** In the run's summary, give the day, the number of cards, how many passed the
   fact-check, the cards brought back, and the quiz size. Say plainly if any card is not
   fact-checked, and why.

## Check before writing

- [ ] No CA Tracker Pro content anywhere.
- [ ] One card per concept. Each card opens with the user's own mistake.
- [ ] Each card teaches in paragraphs and has a Remember line and primary sources.
- [ ] `checked` is `true` only on cards whose every claim passed the blind fact-check.
- [ ] The quiz has 5 to 10 servable items: the misses first, then related checked PYQs.
