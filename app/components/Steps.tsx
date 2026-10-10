/** A simple numbered progress strip so people always know where they are and what's next. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="steps" aria-label="Progress">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li key={label} className={`step ${state}`} aria-current={state === "now" ? "step" : undefined}>
            <span className="step-num" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
