interface ChipSuggestionsProps {
  options: string[];
  onSelect: (option: string) => void;
}

export function ChipSuggestions({ options, onSelect }: ChipSuggestionsProps) {
  if (options.length === 0) return null;
  return (
    <div className="btn-row" style={{ marginTop: 12 }}>
      {options.map((option) => <button key={option} className="btn secondary" type="button" onClick={() => onSelect(option)}>{option}</button>)}
    </div>
  );
}
