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
