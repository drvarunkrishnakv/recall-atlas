# Content conventions

These apply to every topic note and concept card, wherever they are stored. How the prose
reads (sentences, words to avoid, analysis, numbers, citations) is in docs/STYLE_GUIDE.md.

## Topic notes

A note covers one note unit: a group of related syllabus microthemes with their PYQs.
It is a revision note for Mains, not a textbook chapter. Sections, in order:

1. **Lead:** one or two sentences giving the current position.
2. **State of play:** at most 8 dated rows (front · where it stands · since). Rows are
   rewritten when things change, never appended. Displaced rows go to the note's history.
3. **Core:** constitutional and legal framework, institutions, judgments. Changes only
   when the law does.
4. **How it works / comes into force:** one diagram where the topic has a process.
5. **Dimensions:** political, social, economic, governance, international, as relevant;
   ends with Way forward, each point naming who recommended it.
6. **Evidence bank:** one chart where a dated series exists, plus a capped table of figures.
7. **Prelims box:** short facts: Articles, numbers, bodies.
8. **PYQ trail and linkages:** questions with what they demand, plus links to other notes.
9. **Sources and open checks.**

## Study files (pilot)

A study file is a long companion page to one note, for first reading; the note stays the
short revision copy. It is stored as a note with the id `<note>-study` (for example
`P06-study`) and `parent: "<note>"` in its front matter. The app shows it under its parent
note in the breadcrumb, does not count it as a separate note, and gives it no revision
cycle of its own. The same fact and source rules apply.

## Facts and sources

- Every fact has a source, shown as a citation marker after its sentence, never inside it.
  Prefer primary sources: the Constitution, Acts, judgments, PIB, PRS, commission reports.
  Then reputable press.
- Anything that can change carries a date ("as of Oct 2026"). Nothing is "recent" without a date.
- Analysis names who holds the view, or is stated plainly as a takeaway (see the style
  guide); it needs no source.
- A fact that can't be verified goes to Open checks, not into the text.
- Paraphrase; quotes stay under 15 words.

## Concept cards

- One card per case, body, committee, provision or event that notes cite.
- A card has: a one-line summary, key facts, how to use it in Mains, and sources.
- Notes link to cards with term chips (type @ in the editor; `[[card-id|label]]` in the
  Markdown copy). "Cited in" is computed from those links.

## Updates

- Claude's daily run turns real developments into **proposals** for the user to approve.
  Developments are decisions, judgments, reports, notified rules and new official data,
  not meetings, visits or speeches.
- Only approved proposals and changes the user explicitly asks for edit a note's facts.
- Comments: a **comment** is resolved by the user; a **sticky note** is permanent context
  beside the text; an **Ask Claude** thread gets Claude's reply in the thread. Claude
  replies, never resolves the user's threads, and edits a fact only when the thread asks.
- Every change bumps the note's version and keeps the previous body in history.
