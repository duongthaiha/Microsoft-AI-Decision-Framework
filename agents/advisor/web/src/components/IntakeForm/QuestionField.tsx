import type { IntakeQuestion } from '@advisor/shared';

type AnswerValue = string | string[];

interface QuestionFieldProps {
  question: IntakeQuestion;
  value: AnswerValue | undefined;
  onChange: (questionId: string, value: AnswerValue) => void;
}

function toStringValue(value: AnswerValue | undefined): string {
  return Array.isArray(value) ? value.join('\n') : value ?? '';
}

function toArrayValue(value: AnswerValue | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  const options = question.options ?? [];
  return (
    <div className="field">
      <label htmlFor={question.id}>{question.label}{question.required ? ' *' : ''}</label>
      {question.helperText ? <span className="help">{question.helperText}</span> : null}
      {question.type === 'shortText' ? (
        <input id={question.id} className="input" type="text" value={toStringValue(value)} onChange={(event) => onChange(question.id, event.target.value)} />
      ) : null}
      {question.type === 'longText' ? (
        <textarea id={question.id} className="textarea" rows={4} value={toStringValue(value)} onChange={(event) => onChange(question.id, event.target.value)} />
      ) : null}
      {question.type === 'multiText' ? (
        <textarea id={question.id} className="textarea" rows={5} value={toArrayValue(value).join('\n')} onChange={(event) => onChange(question.id, event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} placeholder="One item per line" />
      ) : null}
      {question.type === 'singleSelect' ? (
        <select id={question.id} className="select" value={toStringValue(value)} onChange={(event) => onChange(question.id, event.target.value)}>
          <option value="">Select an option</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : null}
      {question.type === 'multiSelect' ? (
        <div>
          {options.map((option) => {
            const selected = toArrayValue(value).includes(option);
            return (
              <label key={option} className="option">
                <input type="checkbox" checked={selected} onChange={(event) => {
                  const current = toArrayValue(value);
                  onChange(question.id, event.target.checked ? [...current, option] : current.filter((item) => item !== option));
                }} />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
