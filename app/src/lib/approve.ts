// Approving a proposal and restoring a past version, written once over a small storage
// interface, so the dev save API, the app's cloud API and the CLI behave the same.
import type { PageDoc } from "./blocks.ts";
import { planApproval, ProposalError, StaleProposal, type Proposal, type ProposalOp } from "./proposals.ts";
import type { ThreadOp } from "./threads.ts";

export interface PageIO {
  page(): Promise<PageDoc | null>;
  /** Saves with a version check; `reason` always keeps a labelled history snapshot. */
  save(page: PageDoc, baseVersion: number, reason: string): Promise<{ conflict: boolean; version: number }>;
}
export interface ProposalIO extends PageIO {
  proposals(): Promise<Proposal[]>;
  proposalOp(op: ProposalOp): Promise<Proposal[]>;
  threadOp(op: ThreadOp): Promise<unknown>;
}

const shortId = () => globalThis.crypto.randomUUID().slice(0, 12);

/** Applies a pending proposal to its page, records it, and closes the flag it came from. */
export async function approveProposal(io: ProposalIO, proposalId: string) {
  const page = await io.page();
  if (!page || !Array.isArray(page.blocks)) throw new ProposalError("The page isn't there");
  let plan;
  try {
    plan = planApproval(page.blocks, await io.proposals(), proposalId);
  } catch (e) {
    if (e instanceof StaleProposal) await io.proposalOp({ op: "stale", proposalId, note: e.message });
    throw e;
  }
  const r = await io.save({ ...page, blocks: plan.blocks }, page.version, `Approved: ${plan.proposal.reason}`);
  if (r.conflict) throw new ProposalError("The note changed while approving. Try again.");
  const proposals = await io.proposalOp({ op: "applied", proposalId, version: r.version });
  const flag = /^flag:(.+)$/.exec(plan.proposal.origin)?.[1];
  if (flag)
    try {
      await io.threadOp({
        op: "reply",
        threadId: flag,
        comment: { id: shortId(), body: `Approved. Applied in version ${r.version}.` },
        by: "me",
      });
      await io.threadOp({ op: "resolve", threadId: flag });
    } catch {
      /* the flag was deleted: the change still stands */
    }
  return { proposals, version: r.version };
}

/** Makes a past version current again, as a new version (the replaced one stays in history). */
export async function restoreVersion(io: PageIO, old: PageDoc, label: string) {
  const page = await io.page();
  if (!page) throw new ProposalError("The page isn't there");
  const { version: _v, updated: _u, ...rest } = old;
  void _v;
  void _u;
  const r = await io.save(
    { ...page, ...rest, collection: page.collection, id: page.id },
    page.version,
    `Before restoring ${label}`,
  );
  if (r.conflict) throw new ProposalError("The note changed while restoring. Try again.");
  return { version: r.version };
}
