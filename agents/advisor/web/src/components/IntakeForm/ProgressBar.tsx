interface ProgressBarProps {
  current: number;
  total: number;
  isReviewing: boolean;
}

export function ProgressBar({ current, total, isReviewing }: ProgressBarProps) {
  const activeStep = isReviewing ? total + 1 : current + 1;
  return (
    <div className="card" aria-label="Progress">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <strong>Step {activeStep} of {total + 1}</strong>
        <span className="badge">{isReviewing ? 'Review' : `Section ${current + 1}`}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {Array.from({ length: total + 1 }, (_, index) => (
          <div key={index} style={{ flex: 1, height: 8, borderRadius: 99, background: index < activeStep ? 'var(--color-primary)' : 'var(--color-border)' }} />
        ))}
      </div>
    </div>
  );
}
