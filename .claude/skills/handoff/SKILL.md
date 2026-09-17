---
name: handoff
description: Write a handoff document so a fresh session can pick up one feature with no prior conversation. Use this whenever the user says they are starting a new session, switching to a dedicated session for one feature, handing work to a teammate or another agent, wrapping up for the day, or asks for a handoff, brain dump, context dump, or "what does the next person need to know" — and also proactively when a long session has accumulated decisions and traps that would be lost when the conversation ends.
---

# Handoff

A handoff exists because the next session starts cold. It has the code, the git
history and the CI logs — it does not have the argument you had about custody
models, the hour you lost to a resolver that silently loaded the TypeScript
compiler, or the reason a number that looks arbitrary is not.

Everything recoverable from the repo is *not* what makes a handoff valuable.
Write down what would otherwise have to be rediscovered.

## Before writing anything, verify

A handoff is read as fact by someone with no way to check it cheaply. A stale
claim in it is worse than a gap, because a gap prompts a question and a wrong
claim prompts a wasted afternoon.

So run things rather than remembering them:

- The checks the repo actually defines — tests, typecheck, lint, build.
- The current branch, and whether it is ahead of or behind its base.
- CI on the head commit, if the repo has CI.
- Whether the thing you are about to describe as "working" starts.

Write results with numbers (`24 tests pass`), not adjectives (`tests are good`).
If you could not verify something, say so in the document — "not verified since
<date>" is useful; silence is not.

## What goes in

Structure it so the next session can read top to bottom and start working. The
sections below are the ones that consistently earn their space.

### 1. Orientation

Repo, branch, the one-paragraph version of what this feature is, and the single
most useful command to see it running. The reader should be able to act within
two minutes.

### 2. The map

Only the files this feature actually touches, each with a clause on why it
matters. A full directory listing is noise — they can run `ls`. What they cannot
run is your judgement about which six files carry the weight.

### 3. Invariants

The rules that must not be broken, each with the consequence of breaking it.
This is the highest-value section, because these are exactly what a newcomer
breaks without noticing. Frame them as cause and effect, not commandments:

> The server recomputes distance from the raw track and ignores whatever the
> client sends. Accept a client-supplied figure and the phone can mint tokens.

Someone who understands the consequence will defend the rule in situations you
did not anticipate. Someone handed a bare "never do X" will route around it.

### 4. Decisions already made

Choices that look arbitrary but are not, with the reasoning. Include the
alternatives that were rejected and why — otherwise the next session relitigates
them, or worse, silently reverses one.

Distinguish a decision from an accident. "Opaque session tokens, not JWT,
because revocation has to be one UPDATE" is a decision. "No lint on the server
directory" might be either — say which.

### 5. Deliberately not built

The difference between "not done" and "not done *yet*, and here is what it would
take" is most of a handoff's value. For each gap: what is missing, what depends
on it, and whether it blocks anything the next session is likely to attempt.

Be honest about security and correctness gaps in particular. If something checks
that a token is present but not that it is real, say exactly that — a handoff
that oversells is how a placeholder ships.

### 6. Traps

Things that cost you time and will cost them time. Version pins that look
upgradeable but are not. A tool that fails in a confusing way. A config key whose
obvious value is wrong. Each one is a small gift; collectively they are often
the most-thanked part of the document.

### 7. Where to start

One concrete first action, not a menu. If there is genuinely a choice, name your
recommendation and the trade-off, so the reader can disagree deliberately rather
than freeze.

## What stays out

- Anything a `git log` or `ls` answers.
- Narration of how the work went. Nobody needs the chronology.
- Aspiration. A roadmap is not a handoff; if it is not decided, say it is open.
- Praise for the code. It reads as varnish and makes the rest less trustworthy.

## Where it lives

Write to `docs/handoff/<feature>.md` in the repo and commit it. A handoff in
chat dies with the conversation, which defeats the point. Committing it also
means the next session finds it by looking rather than by being told.

If a handoff for that feature already exists, rewrite it rather than appending.
A document with three stratified layers of half-true history is worse than one
that is currently correct — and git keeps the old version anyway.

## Length

Aim for something readable in one sitting — roughly 100–200 lines for a single
feature. If it is running long, the usual cause is describing code that speaks
for itself. Cut that and keep the reasoning.

## Finishing

Tell the user where it is, and give them the exact opening message for the new
session — usually a pointer to the file plus the first task. The new session
reads the file; it does not need the contents pasted into its prompt.
