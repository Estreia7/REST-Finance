# Lessons

## Long lists are searched, never scrolled — dropdowns included

**What happened:** after the owner asked for a search box over every list that
outgrew the screen, the invoice line picker kept a plain `<select>` of every
ingredient (~90). They had to read it one by one to find two "carne" items.

**Rule:** any control that offers a choice among the restaurant's own data
(ingredients, suppliers, products, staff) gets type-to-search once it can pass a
dozen entries. A `<select>` is only for short fixed sets (units, months, roles).
When adding a search box to lists, grep for `<select` over the same data too.

## A confident match is not a reason to stop suggesting

**What happened:** an invoice line that linked itself to one ingredient showed
no other options, although one purchase often feeds several ingredients (the
same mince is "Carne Smash" and "EXTRA CARNE").

**Rule:** when the domain allows one-to-many, keep offering related candidates
(unticked) next to the automatic pick. Auto-linking decides the default, not
what the owner is allowed to see.

## Colours that must tell people apart are the app's job, and always strong

**What happened:** the holiday calendar showed each person in the colour the
owner picked for them in the rota. Two people had both picked blue, and the
pastel labels disappeared on the light-blue weekend cells. My first fix kept the
owner's colours and only nudged the duplicates; the owner wanted the calendar
to choose the colours itself, and every one of them clearly visible.

**Rule:** when colour is how the owner tells people (or series) apart, the app
assigns it from a fixed palette of strong, distinct hues (no greys, no
pastels), checked for contrast against every background it sits on. A user's
own colour choice is for the screen where they made it, not a constraint on
every other view.

## The owner lives in the admin console too

**What happened:** the dock went into the client dashboard only, and I said so
in a line of the report. The owner signs in with the admin account, opened the
console, and could not find it.

**Rule:** when a feature changes the app's frame (navigation, layout, theme),
build it for both shells, `app/dashboard` and `app/admin`, unless told
otherwise. Ask which screen the requester actually uses before leaving one out,
and tell them how to reach the feature from the account they sign in with.

## Money is shown to the cent, everywhere

**What happened:** `formatMoney` defaulted to whole euros, so an invoice line of
€4,32 read as "€4" next to a unit price with cents. The owner wants exact
figures on every screen.

**Rule:** euros always show two decimals. Only chart axes stay compact. Never
add a screen that rounds money away, and use `formatMoney` rather than a local
`toLocaleString`.

## A row that scrolls sideways with no scrollbar hides what does not fit

**What happened:** the shift palette was one row with a hidden scrollbar, so the
owner saw a few shifts and concluded the app was limited to three.

**Rule:** a list of choices wraps. Never rely on a hidden horizontal scroll for
something the owner has to find.

## A reading is not trusted until it adds up

**What happened:** the owner saw mushrooms at €3,69 and blamed the setup screen.
The invoice said 0,905 kg at €3,69 the kilo, €3,34 before VAT. The reader had
shifted every column one place, and only 3 of 14 stored readings added up. No
check existed, and the QR's VAT bases were being thrown away.

**Rule:** prove what a model reads against something it did not read. An invoice
line must multiply out, and lines must reach the QR's base per VAT rate. When an
owner reports a wrong figure, open the real document and do the sum before
changing the screen they are looking at.

## A credit note cancels an invoice

**What happened:** I blocked credit notes from being saved and stopped there. The
owner wanted them reconciled: matched to the invoice of the same value, and
neither counts.

**Rule:** refusing a document is not handling it. When something must not enter
the books, ask what it does to what is already there, and give it a place to
wait when the other half is missing.

## An answer per wording cannot fix a fact about one purchase

**What happened:** the owner could not say a mushroom line was 0,905 kg at 3,69
the kilo. "Configurar" only speaks per wording and supplier, and a weight is
different on every invoice, so typing it there would have given a wrong price
on all of them. The real path was a link to a separate invoice editor, where
changing the quantity left the value behind and refused to confirm.

**Rule:** when the owner is looking at a wrong number, the way to correct that
number belongs on that screen. Decide for every answer whether it is about the
product (remembered) or about this purchase (one line), and offer both. Linked
figures follow each other: never make someone do the multiplication.

## A browser's camera is a video stream, not a camera

**What happened:** invoices photographed inside the app came out blurred while
the iPhone's own camera was sharp. The app froze a 1080p video frame, through a
lens that cannot focus as close as a page is held, and the auto shutter fired
on a still outline whatever the focus was doing. The live outline looked
advanced, so nobody questioned the picture behind it.

**Rule:** when the output's quality is the whole point, measure it against the
plain native path before adding anything clever on top. On phones, use the
device's camera (`capture`) and start from its photograph.

## A screen that shows a result as if it were the source teaches the wrong thing

**What happened:** the app stored 2 bags with 4 buns in each, and the next
invoice came out right by itself. But "Ver e corrigir a fatura" showed 8 at
0,4225 under the invoice's own columns, so the owner took it for the print,
and retyping it wiped the 4 from that line. A small change to the quantity then
meant redoing the sum by hand.

**Rule:** keep what the document says and what we know about the product as two
things on screen, not only in the database. The owner copies the print; the
answer about the product sits apart, is taught once and is applied by the app.

## If the document holds the answer, do not ask the owner

**What happened:** I built a screen for correcting VAT line by line, then a
button to work it out. The owner's answer: this should be automatic, it makes no
sense to be here correcting VAT. The invoice states what each rate adds up to,
so the rates were a sum, not a question.

**Rule:** before building a screen where someone corrects data, ask whether the
data already in hand determines the answer. If it does, do it at read time and
keep the screen for what is really unknown.

## Never assume how a supplier prints a figure: prove it against the totals

**What happened:** a till receipt marked "IVA incluído" printed its line values
with VAT. They were stored as before VAT, and the only sign was a gap equal to
the VAT itself. The owner's rule: invoices differ from supplier to supplier, but
the numbers must always match.

**Rule:** treat each supplier's layout as unknown and let the document's totals
decide. A gap equal to a known figure (the VAT, a discount) is a diagnosis, not a
mismatch. "Proved" means every total matches, not the ones that were convenient.

## Check what a number on screen actually is before reasoning from it

**What happened:** I told the owner a Makro invoice's QR had not been read, because
the list showed €219,94 while the page said €231,41. The list was showing the sum
of the lines, labelled as nothing, and 219,94 minus the printed discount of 14,68
is exactly the 205,26 before VAT. My conclusion was wrong, and I had written it
into an approved plan.

**Rule:** before explaining a figure, read the code that puts it on screen. A
screen that shows one number without saying what it is will mislead the next
reader too, so name it.
