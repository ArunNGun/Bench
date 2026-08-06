# Conventions

## Written content

**No em dashes and no en dashes. Anywhere.** Not in UI copy, not in comments,
not in the README, not in library prose. The user's words: "it looks like ai
wrote this because of this emdash thing." This applies to every file the project
contains.

Hyphens inside compound terms are correct English and stay: half-life, BPC-157,
U-100, 17-alpha-alkylated, beyond-use, one-compartment.

When removing a dash, restructure the sentence. Do not just substitute a comma.
A comma between two independent clauses is a comma splice, and a sweep that did
exactly that left roughly twenty five of them across the codebase, which then
had to be found and rewritten one at a time. Prefer a full stop, a colon, or a
subordinating conjunction.

Never run a bulk regex over prose without checking what it did. See
[06-traps.md](06-traps.md).

## Comments

Comments explain **why**, not what. The bar: would a competent reader be
surprised, or waste time rediscovering this? If yes, write it down, and say what
goes wrong if the code is changed back.

Good: "Read straight from layout on every scroll event rather than deferring to
requestAnimationFrame. rAF is throttled to a standstill in a hidden tab, and a
throttle that can stall is a throttle that can leave the page blank."

Bad: "Add a scroll listener."

Density should match the surrounding file. `src/lib/calc` is heavily commented
because the consequences are real. Component files are lighter.

## Code

- Pure logic goes in `src/lib/calc`, with tests, and no React or I/O.
- Components read state and render. They do not compute doses.
- Prefer explicit units in names: `doseMcg`, `halfLifeHours`, `volumeMl`,
  `weeklyMcg`. Unit confusion is the failure mode this app exists to prevent.
- Time is local unless it is a stored instant. Stored instants are epoch
  milliseconds. Anything touching calendar days uses the helpers in
  `schedule.ts`, never raw date arithmetic.
- Any elapsed-time comparison must handle a negative interval, because device
  clocks move. Decide per case whether "in the future" means fresh or stale, and
  write a test for it. Three separate bugs came from getting this wrong.

## Tests

774 tests, run under Vitest, weighted towards what would be dangerous to get
wrong: reconstitution, unit conversion, PK curves, blend decomposition,
inventory, import parsing, migration.

Run across timezones. DST boundaries have caught real bugs that pass in UTC:

```bash
npm test
TZ=America/New_York npm test
```

Some tests are integrity checks over the library itself rather than over code:
that every half-life is plausible, that Tmax is below `1/ke`, that every dose
figure carries an evidence tag. When one of those fails, check the data before
you change the test. It has been the data more than once. It has also been the
test once, so read carefully.

## The compound library

These rules are the reason the library is worth anything.

1. **No number without a source.** Prescribing labels and SmPCs first, then
   published trials, then registries, then community practice.
2. **Every dose range is tagged with its evidence level.** An approved label and
   a forum convention must never render alike. Community figures are tagged
   `anecdotal`, always, including for user-added custom compounds.
3. **Where human data does not exist, say so.** Set `halfLifeHours: null`, add a
   `halfLifeNote` explaining why, and draw no curve. Trenbolone, boldenone,
   Masteron and NPP are all like this. Inventing a plausible number is the worst
   thing you can do here, because the whole app then quietly lies.
4. **Oil depots show flip-flop kinetics.** For esters the modelled half-life is
   the depot release rate, not the clearance of the parent hormone. Say so in
   the note.
5. **PeptideAtlas is not a source**, despite the name. It is a mass spectrometry
   proteomics repository and holds no pharmacokinetics.
6. Anabolics all set `suppressesNaturalProduction`. Orals set
   `c17AlphaAlkylated` where true, which drives the stacked-orals warning.

## Warnings

A warning the user learns to dismiss is worse than no warning. Interaction
checks are built on receptor classes, not names, so that a deliberate pairing
like CJC-1295 with ipamorelin stays silent while two GLP-1 agonists do not.
Before adding a warning, ask whether it will fire on ordinary correct practice.
