// The editor's schema: BlockNote's default blocks plus the Atlas ones —
// chart (JSON spec), flowchart (Mermaid), callout (incl. the Prelims box) and the inline
// "term" chip that links to a concept card or another note.
import { lazy, Suspense, useState } from "react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { Chart } from "../components/Chart";
import { TermChip } from "../components/Term";

const Mermaid = lazy(() => import("../components/Mermaid"));

export const NEW_CHART = JSON.stringify(
  {
    type: "line",
    title: "New chart",
    x: { field: "year", min: 2015, max: 2025, ticks: [2015, 2020, 2025] },
    y: { min: 0, max: 100, ticks: [0, 50, 100], unit: "%" },
    series: [{ field: "v" }],
    rows: [
      { year: 2015, v: 20 },
      { year: 2020, v: 45 },
      { year: 2025, v: 60 },
    ],
    source: "Add a source",
  },
  null,
  2,
);
export const NEW_FLOW = 'flowchart TD\n  A["First step"] --> B["Second step"]';

/** A visual block whose source (JSON or Mermaid) can be edited in place. */
function SourceEditor({
  label,
  value,
  editable,
  onSave,
  children,
}: {
  label: string;
  value: string;
  editable: boolean;
  onSave: (v: string) => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="visual-block" contentEditable={false}>
      {children}
      {editable && draft === null && (
        <button type="button" className="chip-btn edit-source" onClick={() => setDraft(value)}>
          Edit {label}
        </button>
      )}
      {draft !== null && (
        <div className="source-edit">
          <textarea value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} rows={12} />
          <div className="row">
            <button
              type="button"
              className="chip-btn primary"
              onClick={() => {
                onSave(draft);
                setDraft(null);
              }}
            >
              Apply
            </button>
            <button type="button" className="chip-btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const chartBlock = createReactBlockSpec(
  { type: "chart", propSchema: { spec: { default: NEW_CHART } }, content: "none" },
  {
    render: ({ block, editor }) => (
      <SourceEditor
        label="chart data"
        value={block.props.spec}
        editable={editor.isEditable}
        onSave={(spec) => editor.updateBlock(block, { props: { spec } })}
      >
        <Chart source={block.props.spec} />
      </SourceEditor>
    ),
  },
);

const flowchartBlock = createReactBlockSpec(
  { type: "flowchart", propSchema: { code: { default: NEW_FLOW } }, content: "none" },
  {
    render: ({ block, editor }) => (
      <SourceEditor
        label="flowchart"
        value={block.props.code}
        editable={editor.isEditable}
        onSave={(code) => editor.updateBlock(block, { props: { code } })}
      >
        <Suspense fallback={<div className="mermaid-box">Loading diagram…</div>}>
          <Mermaid code={block.props.code} />
        </Suspense>
      </SourceEditor>
    ),
  },
);

const TONE_LABEL: Record<string, string> = { note: "Note", prelims: "Prelims box", warning: "Check" };

const calloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: { tone: { default: "note", values: ["note", "prelims", "warning"] } },
    content: "inline",
  },
  {
    render: ({ block, contentRef }) => (
      <div className={`callout tone-${block.props.tone}`}>
        <span className="callout-label" contentEditable={false}>
          {TONE_LABEL[block.props.tone]}
        </span>
        <div className="callout-body" ref={contentRef} />
      </div>
    ),
  },
);

const termInline = createReactInlineContentSpec(
  {
    type: "term",
    propSchema: { kind: { default: "card", values: ["card", "note"] }, id: { default: "" }, label: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <TermChip kind={inlineContent.props.kind} id={inlineContent.props.id} label={inlineContent.props.label} />
    ),
  },
);

// Media blocks need file hosting, which comes with Firebase; leave them out until then.
const { audio: _a, video: _v, file: _f, image: _i, ...blocks } = defaultBlockSpecs;
void [_a, _v, _f, _i];

export const schema = BlockNoteSchema.create({
  blockSpecs: { ...blocks, chart: chartBlock(), flowchart: flowchartBlock(), callout: calloutBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, term: termInline },
});

export type AtlasEditor = typeof schema.BlockNoteEditor;
export type AtlasBlock = typeof schema.Block;
export type AtlasPartialBlock = typeof schema.PartialBlock;
