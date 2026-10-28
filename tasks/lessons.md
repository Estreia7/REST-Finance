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
