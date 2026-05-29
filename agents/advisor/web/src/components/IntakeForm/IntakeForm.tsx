import { useMemo, useState } from 'react';
import type { IntakeAnswerMap, IntakeForm as IntakeFormType } from '@advisor/shared';
import { ProgressBar } from './ProgressBar';
import { SectionGroup } from './SectionGroup';

type AnswerValue = string | string[];

interface IntakeFormProps {
  form: IntakeFormType;
  onSubmit: (answers: IntakeAnswerMap) => void;
  isLoading?: boolean;
}

function formatAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' && value.trim() ? value : 'Not answered';
}

export function IntakeForm({ form, onSubmit, isLoading = false }: IntakeFormProps) {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [answers, setAnswers] = useState<IntakeAnswerMap>({});
  const currentSection = form.sections[sectionIndex];
  const allQuestions = useMemo(() => form.sections.flatMap((section) => section.questions), [form.sections]);

  const changeAnswer = (questionId: string, value: AnswerValue) => setAnswers((current) => ({ ...current, [questionId]: value }));
  const next = () => sectionIndex === form.sections.length - 1 ? setIsReviewing(true) : setSectionIndex((value) => value + 1);
  const back = () => isReviewing ? setIsReviewing(false) : setSectionIndex((value) => Math.max(0, value - 1));

  return (
    <div>
      <ProgressBar current={sectionIndex} total={form.sections.length} isReviewing={isReviewing} />
      {!isReviewing && currentSection ? <SectionGroup section={currentSection} answers={answers} onAnswerChange={changeAnswer} /> : null}
      {isReviewing ? (
        <section className="card">
          <h2>Review your answers</h2>
          <p className="muted">This is the flight plan. Check the destination before we pick the aircraft.</p>
          <div className="grid">
            {allQuestions.map((question) => (
              <div key={question.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                <strong>{question.label}</strong>
                <p className="muted" style={{ margin: '6px 0 0' }}>{formatAnswer(answers[question.id])}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="btn-row">
        <button className="btn secondary" type="button" onClick={back} disabled={isLoading || (!isReviewing && sectionIndex === 0)}>Back</button>
        {!isReviewing ? <button className="btn" type="button" onClick={next} disabled={isLoading}>Next</button> : null}
        {isReviewing ? <button className="btn" type="button" onClick={() => onSubmit(answers)} disabled={isLoading}>{isLoading ? 'Submitting...' : 'Submit intake'}</button> : null}
      </div>
    </div>
  );
}
