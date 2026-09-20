/* Generates the landing page photography with scripts/kie.mjs.
 *
 *   node scripts/generate-landing-images.mjs           # skips what exists
 *   node scripts/generate-landing-images.mjs --force   # regenerates everything
 *
 * Five images, ~6 credits each at 1K. Output lands in public/landing/ as
 * WebP at the width each slot actually renders at — the raw PNGs are ~2 MB
 * and a landing page cannot carry that five times over.
 */

import { generateSet, credit } from "./kie.mjs";

/* One style preamble across the whole set. This is what makes five separate
 * generations read as one commission by one photographer rather than five
 * stock purchases: same camera, same light, same grade, same restraint. The
 * grade is tied to the brand — warm neutrals, amber highlights, navy shadows
 * — so the photography sits inside the design system instead of beside it. */
const STYLE = [
  "Documentary editorial photograph, shot on a full-frame camera with a 35mm",
  "prime lens at f/2.0. Natural window light, warm and soft, late afternoon.",
  "Muted warm-neutral colour grade: cream and oatmeal tones, deep navy-charcoal",
  "shadows, occasional warm amber highlight from brass or tungsten. Subdued,",
  "understated, unsaturated — never vivid or commercial. Fine film grain,",
  "shallow depth of field, candid and unposed, no eye contact with the camera,",
  "no stock-photo smiling. Real small independent European restaurant, lived-in",
  "and slightly worn, not a showroom. No text, no logos, no watermarks, no",
  "readable signage, no screens showing user interfaces.",
].join(" ");

const IMAGES = [
  {
    // Hero: sits behind/beside the headline, so it must be wide, calm, and
    // have quiet areas where type can land without a scrim fighting it.
    slug: "hero-dining-room",
    ratio: "16:9",
    width: 1920,
    prompt: [
      "The empty dining room of a small independent restaurant in the quiet hour",
      "before service. Wooden tables with paper cloths, bentwood chairs, a worn",
      "tiled floor, a brass pendant lamp catching the light. Sunlight falls in",
      "long soft bands across the tables from tall windows on the left. Wide",
      "establishing shot from the doorway, deep perspective down the room.",
      "Uncluttered, generous negative space in the upper half of the frame.",
      "Nobody in the room.",
    ].join(" "),
  },
  {
    // Problem section: the paperwork chaos the product replaces. This one
    // should feel mildly stressful — it is the "before".
    slug: "invoices-counter",
    ratio: "3:2",
    width: 1200,
    prompt: [
      "A messy stack of supplier delivery notes and paper invoices spread across",
      "a stainless steel restaurant counter, held down by a pen and a chipped",
      "espresso cup. Some sheets curled, one crumpled, a cheap pocket calculator",
      "half-buried among them. Shot from directly above at a slight angle,",
      "top-down flat lay. Hard side light raking across the paper texture,",
      "casting real shadows. Blank unprinted paper with no readable text.",
      "Quietly overwhelming.",
    ].join(" "),
  },
  {
    // How-it-works: the owner doing the nightly close. The human moment of
    // the product — deliberately hands-and-shoulders, no face.
    slug: "owner-closing-books",
    ratio: "3:2",
    width: 1200,
    prompt: [
      "A restaurant owner in a dark apron sitting alone at a corner table after",
      "closing, doing the books. Hands resting on an open paper ledger beside a",
      "glass of water and a small brass desk lamp. The dining room behind is",
      "dark and out of focus, chairs already stacked. Photographed from the side",
      "at table height, framed from the shoulders down so the face is out of",
      "frame. Single warm pool of lamplight in deep shadow. Tired, focused,",
      "end-of-day calm.",
    ].join(" "),
  },
  {
    // Features / metrics: the cost side of the business made physical. Crates
    // of produce = food cost, the number the product is actually about.
    slug: "supplier-delivery",
    ratio: "3:2",
    width: 1200,
    prompt: [
      "Wooden and plastic crates of fresh produce just delivered at a",
      "restaurant's back door — tomatoes, lemons, leafy greens, a sack of",
      "onions — stacked on a worn concrete floor. A hand in a rolled shirtsleeve",
      "reaches in to lift the top crate. Cool daylight from the open doorway",
      "meets warm interior light from inside the kitchen. Shot at crate height,",
      "close and slightly low. Textural, honest, unstyled.",
    ].join(" "),
  },
  {
    // Final CTA: craft and control. Ends the page on competence rather than
    // on the problem it opened with.
    slug: "kitchen-mise-en-place",
    ratio: "3:2",
    width: 1200,
    prompt: [
      "A professional kitchen prep station mid-service-prep: stainless steel",
      "bench with neat rows of small metal containers of chopped herbs and",
      "vegetables, a chef's knife resting on a scarred wooden board, a folded",
      "kitchen cloth. Steam drifting faintly at the edge of frame. Shallow",
      "focus along the row of containers, the far end falling soft. Shot from",
      "bench height, close. Orderly and controlled — the opposite of the",
      "paperwork. No people in frame.",
    ].join(" "),
  },
];

const force = process.argv.includes("--force");

const before = await credit();
console.log(`${before} credits available, about ${IMAGES.length * 6} needed.\n`);

const { done, failed } = await generateSet(IMAGES, {
  outDir: "public/landing",
  style: STYLE,
  force,
});

console.log(`${await credit()} credits left.`);
process.exit(failed && !done ? 1 : 0);
