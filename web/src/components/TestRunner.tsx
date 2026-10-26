import { useRef, useState } from "react";
import { skillName } from "../content/primer";
import { childMathToLatex } from "../math/latex";
import { Tex } from "../math/MathText";
import { CHECKED_AS, type GeneratedProblem } from "../mock/generate";
import { POST_TEST, PRE_TEST, scoreTest, type TestScore } from "../mock/pretest";
import { TEST_DONE, TEST_INSTRUCTIONS, TEST_INTRO, TEST_NOTE, TEST_TITLE } from "../mock/script";
import { canCheck } from "./answer";
import { MathInput } from "./MathInput";

// The pre and post test (R-26): one problem at a time, with no hints and no feedback, and a
// simple score at the end. Answers live only in this component until the score is worked out,
// then they're dropped. Nothing is stored or sent; the score is on screen only (P-1).

export function TestRunner({ form, onDone }: { form: "pre" | "post"; onDone: () => void }) {
  const problems = form === "pre" ? PRE_TEST : POST_TEST;
  const [index, setIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [score, setScore] = useState<TestScore | null>(null);
  const answers = useRef<string[]>([]);

  const next = (text: string) => {
    if (index === null) return;
    answers.current[index] = text;
    setDraft("");
    if (index + 1 < problems.length) {
      setIndex(index + 1);
      return;
    }
    setScore(scoreTest(problems, answers.current));
    answers.current = [];
    setIndex(null);
  };

  if (score) {
    return (
      <section className="card test" aria-labelledby="test-heading">
        <h1 id="test-heading">{TEST_DONE}</h1>
        <p className="test__score">
          <strong>
            {score.correct} out of {score.total}
          </strong>{" "}
          on the {form === "pre" ? "pre-test" : "post-test"}
        </p>
        <table className="test__skills">
          <tbody>
            {score.bySkill.map((s) => (
              <tr key={s.skill_id}>
                <th scope="row">{skillName(s.skill_id)}</th>
                <td>
                  {s.correct} of {s.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="test__note">{TEST_NOTE}</p>
        <button type="button" className="btn btn--primary btn--big" onClick={onDone}>
          Done
        </button>
      </section>
    );
  }

  if (index === null) {
    return (
      <section className="card test" aria-labelledby="test-heading">
        <h1 id="test-heading">{TEST_TITLE}</h1>
        <p>{TEST_INTRO}</p>
        <button type="button" className="btn btn--primary btn--big" onClick={() => setIndex(0)} autoFocus>
          Start
        </button>
      </section>
    );
  }

  const submit = () => {
    if (draft.trim()) next(draft.trim());
  };
  return (
    <TestQuestion
      problem={problems[index]!}
      index={index}
      total={problems.length}
      draft={draft}
      onDraft={setDraft}
      onNext={submit}
      onSkip={() => next("")}
    />
  );
}

interface QuestionProps {
  problem: GeneratedProblem;
  index: number;
  total: number;
  draft: string;
  onDraft: (text: string) => void;
  onNext: () => void;
  onSkip: () => void;
}

/** One question: no hint button and no verdict, only "next" or "skip". */
export function TestQuestion({ problem, index, total, draft, onDraft, onNext, onSkip }: QuestionProps) {
  return (
    <section className="card test problem" aria-labelledby="test-question">
      <p className="problem__count">
        Question {index + 1} of {total}
      </p>
      <h2 id="test-question" className="problem__instruction">
        {TEST_INSTRUCTIONS[CHECKED_AS[problem.node]]}
      </h2>
      <div className="problem__prompt">
        <Tex latex={childMathToLatex(problem.prompt)} display />
      </div>
      <MathInput
        key={index}
        id="answer"
        label="Your answer"
        value={draft}
        placeholder="Your answer"
        onChange={onDraft}
        onSubmit={onNext}
        autoFocus
      />
      <div className="problem__actions">
        <button type="button" className="btn btn--primary" onClick={onNext} disabled={!canCheck(draft)}>
          {index + 1 < total ? "Next question" : "Finish"}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onSkip}>
          Skip this one
        </button>
      </div>
    </section>
  );
}
