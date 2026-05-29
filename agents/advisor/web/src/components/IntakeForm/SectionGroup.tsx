import type { IntakeAnswerMap, IntakeSection } from '@advisor/shared';
import { QuestionField } from './QuestionField';

type AnswerValue = string | string[];

interface SectionGroupProps {
  section: IntakeSection;
  answers: IntakeAnswerMap;
  onAnswerChange: (questionId: string, value: AnswerValue) => void;
}

export function SectionGroup({ section, answers, onAnswerChange }: SectionGroupProps) {
  return (
    <section className="card">
      <h2>{section.title}</h2>
      {section.questions.map((question) => (
        <QuestionField key={question.id} question={question} value={answers[question.id] as AnswerValue | undefined} onChange={onAnswerChange} />
      ))}
    </section>
  );
}
