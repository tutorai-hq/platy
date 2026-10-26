# The Primer: V1 Requirements

*DRAFT, pending approval by Connor or Michael. Distilled from `the-primer-initial-vision.md`, the kickoff brief and `DECISIONS.md`. `scope-skeptic` traces every added unit of code to an R-id here, so code with no R-id behind it gets a CUT verdict. IDs are stable: retire an R-id rather than renumbering.*

## Audience

**V1 (the MVP) is for students aged 13 and up, who use Platy on their own.** There are no parent accounts, parent onboarding or parent reporting in V1. The one exception is the safety parent-notice path (R-22), which stays. Parents come in at V2/V3, when Platy moves down to students under 13 (decided by Michael, 2026-10-18). The parent requirements below are kept, with their R-ids, under "Deferred to V2/V3". `DECISIONS.md` A-9 records this in a note (2026-10-18).

## Tutoring behavior (pedagogy rules)

These are written as testable rules because the pedagogy eval (`scripts/eval`, next phase) checks them.

- **R-01 Diagnose before teaching.** When a child is stuck, the tutor probes prerequisite sub-skills one or two levels down the skill graph before it explains the target concept.
- **R-02 Productive struggle.** Never give the answer on the first wrong attempt. Hold off for at least one more try.
- **R-03 Self-explanation.** Ask the child to explain their reasoning before correcting it.
- **R-04 Retrieval practice.** Periodically prompt recall of earlier material instead of re-teaching it from scratch. The scheduling layer (R-12) picks what to recall.
- **R-05 Change the angle.** When an explanation doesn't land, try a different one rather than repeating it.
- **R-06 Short replies.** Response length is capped, and each reply carries one concept at a time.
- **R-07 Interest hooks.** Reframe concepts through interests in the child's personality file (R-14), and approach sensitive topics sideways.
- **R-08 Pedagogy eval suite.** Scripted fake-student cases (wrong answer, direct request for the answer, frustrated child, off-topic, safety disclosure, a student who says they're under 13) check R-01…R-07, R-21…R-23 and R-36. It must exist before the first tutoring prompt is committed (the gate fails closed) and must pass before any real child uses the product.

## Skill map and mastery

- **R-10 Skill graph.** One machine-queryable graph (JSON or graph DB) of about 50–100 algebra sub-skills with prerequisite edges, starting from Common Core algebra progressions (A-6).
  - *Demo note (Platy, approved 2026-10-17):* one unit (solving linear equations), 14–18 nodes, exactly one top-level node, three probes per node, every probe answer verified by sympy.
- **R-11 Mastery model.** Per-child, per-skill BKT via pyBKT. Hint use, response time and self-explanation quality are bucketed into discrete `multigs` classes (A-5). Skills are independent, with no DBN.
- **R-12 Scheduling layer.** Spaced repetition plus implicit review sits on top of the mastery model: solving a downstream problem counts as review of its prerequisites (A-5).
- **R-13 Generated skill view.** Any human-readable view of the skill map is generated from R-10, never hand-maintained (A-6).

## Child profile and onboarding

- **R-14 Personality file.** One per child, holding interests, motivational hooks and sensitive topics to avoid (A-9). In V1 the student fills it during onboarding (R-15), not a parent.
- **R-15 Child onboarding.** A warm, interests-first chat with embedded low-stakes diagnostic problems that produce real BKT signal, not self-report (A-9). In V1 the same chat also asks about interests, what motivates them and topics they'd rather skip, which fills the personality file (R-14).
- **R-16 Parent onboarding.** *Deferred to V2/V3, see below.*

## Session

- **R-17 Hard resets.** Reset the live conversation only at natural breakpoints (end of a problem, a topic switch), then reload from the skill map and personality file. No summarizing or compacting (A-4).
- **R-18 Text input.** The child can type.
- **R-19 Voice input.** Speech-to-text only. Audio is discarded after transcription, and there's no acoustic inference (A-7).
- **R-20 Photo input.** A photo of handwritten work is read by a vision model and is not persisted.

## Wellbeing and safety

- **R-21 De-escalation ladder,** driven by behavioral proxies only: wrong attempts, latency, silence and explicit self-report (A-7).
  1. First occurrence in a session → pivot or pause.
  2. Repeated in the same session → switch to a confidence-building topic.
  3. A multi-day pattern → in V1, a constructive note to the student ("here's a sticking point and what we tried"). The parent version of this note is V2/V3.
- **R-22 Safety disclosures.** Disclosures of abuse, self-harm or danger get a hard-coded escalation to a parent/guardian and/or crisis resources. V1 has no parent onboarding or account features, but the safety parent-notice path stays (A-9 note): detection, then a codes-only notice held in memory, shown on the demo panel. That's a legal duty, not a parent feature. The student also gets crisis resources and a clear push to reach a trusted adult (open question 4). The tutor never handles one itself or acts as a therapist. Scripted eval cases are required before the first real child. *The detection design is still Open in `DECISIONS.md`. This R-id only fixes that V1 must have one.*
- **R-23 Warm, not "your friend".** The tutor is curious and kind, and it nudges the child back toward real friends and family. It never encourages dependency.

## Privacy, platform and measurement

- **R-25 Privacy invariants.** Every P-id in `PRIVACY.md` is a requirement.
- **R-26 Learning-gain measurement.** V1 can run a pretest/posttest on related-but-not-identical items (A-10). The item design is Open.
- **R-27 Target devices.** It runs in a browser on a school Chromebook (1366×768) and on a phone. Inference is in the cloud, on Connor's own servers (A-1).
- **R-36 Age gate.** *(R-28–R-30 and P-14 are reserved by Connor's pending demo spec in `CLAUDE.md`; R-31–R-35 are unused.)* Sign-up asks for age in a neutral way (no hint that 13 is the cutoff) before collecting anything else. Anyone under 13 is turned away and nothing they entered is kept (P-15). Sign-up isn't the only way to learn a student's age: if a student says or shows during a session that they're under 13 (in the onboarding chat, a message or a photo), the session ends kindly and their stored state (personality file, mastery, session records) is deleted. How the tutor spots this is Open, like R-22 detection, and the signal is recorded only as a code (P-1, P-10). V1's 13+ audience depends on all of this, but the gate keeps Platy outside COPPA's parental-consent rules only if Platy also isn't "directed to children" (open question 5).

## Content library

*R-37 and R-38 approved by Michael, 2026-10-18 (Michael and Connor have equal say). Design: `docs/content-library.md`. R-43 to R-47 are proposed there (§10) and aren't approved yet.*

- **R-37 Content library.** The primer teaches with a library of content items (puzzles, reels, worked-example clips, stories, songs, whiteboard scenes). Each item is one skill × angle × format, described by a validated descriptor keyed to skill-map node ids, and holds no student data. Players for each format are components in `web/`. Policy chooses which item to show; the server generates every problem and grades every check with `platy.mathcheck`, never the browser or a model. Whether content goes in the demo itself is Open (open question 7).
- **R-38 Interest skins and slots.** Template items (puzzles, games, whiteboard scenes, short reels) expose named slots: colors, team and player names, an emblem and setting words. A skin per interest tag, from a fixed vocabulary, fills them with defaults, and the student's own picks from fixed lists override them. Slots never change an item's math or interaction. Content never uses real logos, team names or player names. Recorded media (narrated video, songs) varies per interest tag, never per student.
- **R-39 Step-by-step solving.** *(Approved by Michael, 2026-10-22.)* On an equation problem the student writes one line at a time. Each line is checked as a valid next step before the next line opens. A wrong line is marked on that line, and the student fixes it before moving on. The final answer alone never counts as a solution.
- **R-40 Slip map.** *(Approved by Michael, 2026-10-22.)* Each skill node lists its common wrong steps (slips). Each slip has a detection rule, a short hint that names the mistake without giving the answer, and the id of a repair item. A wrong step that matches a slip shows that hint on the line where it happened.
- **R-41 Generated problems.** *(Approved by Michael, 2026-10-22.)* Each demo skill node (`integer_arithmetic`, `inverse_operations`, `one_step_equations`, `two_step_equations`, `order_of_operations`) has a problem generator with at least three difficulty levels; the other skill nodes get theirs after the demo. Generated problems have clean answers, never repeat within a session, and are verified by the math checker before a student sees them.
- **R-42 Primer view (demo).** *(Approved by Michael, 2026-10-26.)* A demo-only panel beside the student view shows what the primer believes and why: mastery per skill on the current path, its current hypothesis (for example, 'suspects a gap in inverse operations, probing'), and a one-line reason for each move it makes. It shows codes and numbers only, never the student's messages, and it's off unless the demo flag is on.

## Not V1: code for these gets a CUT verdict

- Real-world grounding; teacher sync; hardware or wearables; audiences beyond K-12 children.
- Students under 13, and anything parent-facing: parent accounts, consent flows, the questionnaire, summaries, notes or a dashboard (V2/V3, see below). The exception is R-22's safety parent-notice path, which stays.
- Subjects other than algebra, and abstractions for multiple subjects.
- The RAG ground-truth content layer. The vision doc sequences it after the core loop is validated, so it needs its own R-id when that happens.
- School or district integration and deployment (A-1, A-9).
- Tone or acoustic emotion detection (A-7).

## Deferred to V2/V3 (parents, students under 13)

Kept so the R-ids stay stable. Code for these in V1 gets a CUT verdict.

- **R-16 Parent onboarding.** A parent questionnaire fills the personality file. An optional one-time grade/transcript share is used as a rough prior and then discarded. There is no school-record integration (A-9).
- **R-24 Parent summaries** name sticking points and what was tried, never "your child failed." They're built from distilled state (P-8), not transcripts.
- The parent note at R-21 step 3, and delivering R-22's parent notice to a real parent (the V1 demo keeps the notice path and shows it on the demo panel).

## Open questions for Connor and Michael (no R-id until answered)

1. Is a **student-facing landing page** or subscription billing in V1, and who pays in V1 now that parents aren't the buyer? The harness installs `design-taste-frontend` for a landing page, but no requirement asks for one yet.
2. **Accounts and auth.** How does a student 13+ sign up and sign in on their own, and where does the R-36 age gate sit in that flow?
3. **DECISIONS.md after the A-9 note (2026-10-18).** The note records the V1 audience: students 13+, no parent onboarding or parent account features, the student filling the personality file, and the safety parent-notice path kept. P-15 traces to it. Still open: A-1 cites a "parent-channel distribution plan", which V1 no longer has.
4. **Safety escalation for real users (R-22).** In the demo, the parent notice is held in memory and shown on the demo panel. With no parent accounts in V1, where does it go for real users, and is crisis resources plus "talk to a trusted adult" enough for 13–17-year-olds, or is anything else needed? Detection is already Open in `DECISIONS.md`.
5. **COPPA and teen privacy laws.** 13+ avoids COPPA's parental-consent rule only if Platy isn't "directed to children" and doesn't knowingly collect from under-13s (R-36). The FTC judges "directed to children" on the whole picture: subject matter, animated characters (like the cartoon Platy mascot in `web/`), the ages of intended and actual users, and marketing. Some accelerated 7th graders take Algebra 1, so expect under-13 interest. Ask a lawyer to confirm Platy is a general-audience service, and what in a chat counts as knowing a student is under 13 (a stated age, a grade, a joke). Separately, some laws still cover 13–17-year-olds (for example California for under-16s and New York's Child Data Protection Act for under-18s), and the EU sets digital consent at 13–16 depending on the country. All of this needs a lawyer's look before the first real users.
6. **The demo contract in `CLAUDE.md` vs. V1 scope.** Resolved 2026-10-18: the demo frontend is the React + Vite app in `web/`, with a FastAPI server in front of `platy` (A-11), and the contract's codes-only `ParentNotice` on a safety disclosure stays (A-9 note, R-22).
7. **Content in the demo (R-37).** The vision doc sequences the content layer after the core loop is validated. Content players are built in `web/` against the mock now; does any content go in the demo itself, or does it wait for the core loop?
