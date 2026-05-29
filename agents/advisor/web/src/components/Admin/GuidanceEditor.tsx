import { useState } from 'react';
import type { CustomerGuidanceDocument, CustomInstruction, OrganizationContext } from '@advisor/shared';

interface GuidanceEditorProps {
  doc: CustomerGuidanceDocument;
  orgId: string;
  onSave: (doc: CustomerGuidanceDocument) => void;
  onCancel: () => void;
}

const splitLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const joinLines = (value: string[]) => value.join('\n');

export function GuidanceEditor({ doc, orgId, onSave, onCancel }: GuidanceEditorProps) {
  const [draft, setDraft] = useState<CustomerGuidanceDocument>(doc);
  const updateContext = <K extends keyof OrganizationContext>(key: K, value: OrganizationContext[K]) => setDraft((current) => ({ ...current, organizationContext: { ...current.organizationContext, [key]: value } }));
  const updateInstruction = (index: number, patch: Partial<CustomInstruction>) => setDraft((current) => ({ ...current, instructions: current.instructions.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  return (
    <section className="card">
      <div className="btn-row" style={{ justifyContent: 'space-between' }}><h2>Edit guidance: v{draft.version}</h2><span className="badge">{orgId}</span></div>
      <div className="grid two">
        <div className="field"><label>Company summary</label><textarea className="textarea" rows={5} value={draft.organizationContext.companySummary} onChange={(e) => updateContext('companySummary', e.target.value)} /></div>
        <div className="field"><label>Business priorities</label><textarea className="textarea" rows={5} value={joinLines(draft.organizationContext.businessPriorities)} onChange={(e) => updateContext('businessPriorities', splitLines(e.target.value))} /></div>
        <div className="field"><label>Preferred channels</label><textarea className="textarea" rows={4} value={joinLines(draft.organizationContext.preferredChannels)} onChange={(e) => updateContext('preferredChannels', splitLines(e.target.value))} /></div>
        <div className="field"><label>Operating constraints</label><textarea className="textarea" rows={4} value={joinLines(draft.organizationContext.operatingConstraints)} onChange={(e) => updateContext('operatingConstraints', splitLines(e.target.value))} /></div>
        <div className="field"><label>Technology preferences</label><textarea className="textarea" rows={4} value={joinLines(draft.organizationContext.technologyPreferences)} onChange={(e) => updateContext('technologyPreferences', splitLines(e.target.value))} /></div>
      </div>
      <h3>Instructions</h3>
      <div className="grid">
        {draft.instructions.map((instruction, index) => (
          <div key={instruction.id} className="card" style={{ boxShadow: 'none' }}>
            <div className="grid two">
              <div className="field"><label>ID</label><input className="input" value={instruction.id} onChange={(e) => updateInstruction(index, { id: e.target.value })} /></div>
              <div className="field"><label>Applies to framework questions</label><input className="input" value={instruction.appliesToFrameworkQuestions.join(', ')} onChange={(e) => updateInstruction(index, { appliesToFrameworkQuestions: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></div>
            </div>
            <div className="field"><label>Text</label><textarea className="textarea" rows={4} value={instruction.text} onChange={(e) => updateInstruction(index, { text: e.target.value })} /></div>
            <button className="btn danger" type="button" onClick={() => setDraft((current) => ({ ...current, instructions: current.instructions.filter((_, i) => i !== index) }))}>Remove</button>
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn secondary" type="button" onClick={() => setDraft((current) => ({ ...current, instructions: [...current.instructions, { id: `instruction-${current.instructions.length + 1}`, text: '', appliesToFrameworkQuestions: [] }] }))}>Add Instruction</button>
        <button className="btn" type="button" onClick={() => onSave({ ...draft, customerOrganizationId: orgId, lastEditedAt: new Date().toISOString(), lastEditedBy: 'web-admin' })}>Save</button>
        <button className="btn secondary" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
