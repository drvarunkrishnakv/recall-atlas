// Page photos on the device: shrink a large photo before it is sent, and turn it the right way up.
// "Straighten" is a simple quarter turn for now (no automatic deskewing or cropping).
import { changeAnswer, uploadPhoto } from "../content/mains";
import { nextPhotoFile, type AnswerPage, type MainsAnswer } from "../lib/mains";

/** The longest side a sent photo keeps; plenty to read handwriting. */
const LONG_SIDE = 2000;

/** Reads a photo, turns it `turns` quarter turns clockwise and shrinks it, as a JPEG. */
export async function preparePhoto(file: Blob, turns = 0): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const side = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = side ? h : w;
  canvas.height = side ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns % 4) * (Math.PI / 2));
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare that photo."))), "image/jpeg", 0.85),
  );
}

/**
 * The originals of photos taken on this device, so a page can still be turned after it was sent.
 * Pages sent from another device can be reordered or removed here, but turned only there.
 */
const originals = new Map<string, { file: Blob; turns: number }>();
const key = (answerId: string, file: string) => `${answerId}/${file}`;
export const canTurn = (answerId: string, file: string) => originals.has(key(answerId, file));

/** Shrinks and sends one photo as the answer's next page (or rewrite), and returns its page entry. */
export async function sendPhoto(
  answer: MainsAnswer,
  file: Blob,
  kind: "page" | "rewrite" = "page",
  taken: string[] = [],
): Promise<AnswerPage> {
  const blob = await preparePhoto(file);
  const used = [...answer.pages.map((p) => p.file), ...answer.rewrites.map((r) => r.page.file), ...taken];
  const name = nextPhotoFile(used, "image/jpeg", kind);
  await uploadPhoto(answer.id, name, blob, "image/jpeg");
  const page: AnswerPage = { file: name, type: "image/jpeg", at: new Date().toISOString() };
  originals.set(key(answer.id, name), { file, turns: 0 });
  if (kind === "page") await changeAnswer(answer.id, { op: "addPage", page });
  return page;
}

/** Turns a page a quarter turn clockwise and sends it again under the same name. */
export async function turnPage(answer: MainsAnswer, page: AnswerPage) {
  const o = originals.get(key(answer.id, page.file));
  if (!o) return;
  const turns = (o.turns + 1) % 4;
  const blob = await preparePhoto(o.file, turns);
  await uploadPhoto(answer.id, page.file, blob, "image/jpeg");
  o.turns = turns;
  await changeAnswer(answer.id, { op: "addPage", page: { ...page, at: new Date().toISOString() } });
}
