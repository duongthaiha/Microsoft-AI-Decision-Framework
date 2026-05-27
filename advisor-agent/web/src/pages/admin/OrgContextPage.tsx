import React, { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost } from '../../api/client';
import type { OrgContext, OrgContextVersion } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function tryParseJson<T>(src: string, fallback: T): T {
  try { return JSON.parse(src) as T; } catch { return fallback; }
}

// ─── Edit form ────────────────────────────────────────────────────────────────

interface EditState {
  changeSummary: string;
  systemInventoryJson: string;
  entitlementsJson: string;
  customInstructionsJson: string;
}

function contentToEditState(content: OrgContext): EditState {
  return {
    changeSummary: content.changeSummary ?? '',
    systemInventoryJson: safeJson(content.systemInventory ?? []),
    entitlementsJson: safeJson(content.entitlements ?? []),
    customInstructionsJson: safeJson(content.customInstructions ?? []),
  };
}

function editStateToContent(base: OrgContext, edit: EditState): OrgContext {
  return {
    ...base,
    changeSummary: edit.changeSummary,
    systemInventory: tryParseJson(edit.systemInventoryJson, base.systemInventory),
    entitlements: tryParseJson(edit.entitlementsJson, base.entitlements),
    customInstructions: tryParseJson(edit.customInstructionsJson, base.customInstructions),
  };
}

function isEditDirty(original: OrgContext, edit: EditState): boolean {
  const rebuilt = editStateToContent(original, edit);
  return JSON.stringify(rebuilt) !== JSON.stringify(original);
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3500);
  }, []);
  return { message, show };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type VersionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; versions: OrgContextVersion[] }
  | { kind: 'error'; message: string };

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * OrgContextPage — version list (left) + edit form (right).
 * M2: fully wired to /admin/org-context/versions endpoints.
 */
export function OrgContextPage() {
  const [versionsState, setVersionsState] = useState<VersionsState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { message: toastMessage, show: showToast } = useToast();

  // Load version list
  const loadVersions = useCallback(() => {
    setVersionsState({ kind: 'loading' });
    apiGet<OrgContextVersion[]>('/admin/org-context/versions')
      .then((versions) => {
        setVersionsState({ kind: 'ready', versions });
        // Auto-select the most recently published, or newest
        if (versions.length > 0 && !selectedId) {
          const pub = versions.find((v) => v.published);
          setSelectedId((pub ?? versions[0]).id);
        }
      })
      .catch((err) =>
        setVersionsState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [selectedId]);

  useEffect(() => { loadVersions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When selected version changes, initialise edit state
  useEffect(() => {
    if (versionsState.kind !== 'ready' || !selectedId) return;
    const v = versionsState.versions.find((x) => x.id === selectedId);
    if (v) setEdit(contentToEditState(v.content));
  }, [selectedId, versionsState]);

  const selectedVersion =
    versionsState.kind === 'ready'
      ? versionsState.versions.find((v) => v.id === selectedId) ?? null
      : null;

  const isDirty = selectedVersion && edit ? isEditDirty(selectedVersion.content, edit) : false;
  const isPublished = selectedVersion?.published ?? false;

  async function handleSaveAsDraft() {
    if (!selectedVersion || !edit) return;
    setSaving(true);
    try {
      const newContent = editStateToContent(selectedVersion.content, edit);
      const created = await apiPost<OrgContextVersion>(
        '/admin/org-context/versions',
        newContent,
      );
      setVersionsState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return { kind: 'ready', versions: [created, ...prev.versions] };
      });
      setSelectedId(created.id);
      showToast(`Draft v${created.version} saved`);
    } catch (err) {
      showToast(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!selectedVersion || isPublished) return;
    setPublishing(true);
    try {
      await apiPost(`/admin/org-context/versions/${selectedVersion.id}/publish`, {});
      showToast(`Published v${selectedVersion.version}`);
      loadVersions();
    } catch (err) {
      showToast(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPublishing(false);
    }
  }

  const updateEdit =
    (field: keyof EditState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEdit((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));

  return (
    <section aria-labelledby="org-context-heading" className="org-context-page">
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      <h1 id="org-context-heading">Org Context</h1>
      <p>
        The organisation context shapes every recommendation. Edit a draft and
        publish when ready.
      </p>

      {versionsState.kind === 'loading' && (
        <p className="placeholder-note">Loading versions…</p>
      )}
      {versionsState.kind === 'error' && (
        <p className="placeholder-note">
          Could not load versions ({versionsState.message}).
        </p>
      )}

      {versionsState.kind === 'ready' && (
        <div className="versions-layout">
          {/* Left: version list */}
          <aside className="versions-list" aria-label="Version history">
            <h2>Versions</h2>
            {versionsState.versions.length === 0 && (
              <p className="placeholder-note">No versions yet.</p>
            )}
            <ul>
              {versionsState.versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={`version-item${v.id === selectedId ? ' version-item--selected' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <span className="version-item__number">v{v.version}</span>
                    {v.published && (
                      <span className="version-badge version-badge--published">Published</span>
                    )}
                    {v.publishedBy && (
                      <span className="version-item__meta">{v.publishedBy}</span>
                    )}
                    <span className="version-item__time">
                      {relativeTime(v.publishedAt ?? v.content.editedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Right: edit form */}
          {selectedVersion && edit ? (
            <div className="version-editor">
              <div className="version-editor__header">
                <span className="version-editor__title">
                  v{selectedVersion.version}
                  {isPublished && (
                    <span className="version-badge version-badge--published" style={{ marginLeft: '0.5rem' }}>
                      Published
                    </span>
                  )}
                </span>
                <div className="version-editor__actions">
                  <button
                    type="button"
                    onClick={handleSaveAsDraft}
                    disabled={saving || publishing || !isDirty}
                    title={!isDirty ? 'No changes to save' : undefined}
                  >
                    {saving ? 'Saving…' : 'Save as new draft'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handlePublish}
                    disabled={publishing || saving || isPublished}
                    title={isPublished ? 'Already published' : undefined}
                  >
                    {publishing ? 'Publishing…' : 'Publish this version'}
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="oc-change-summary">Change summary</label>
                <input
                  id="oc-change-summary"
                  type="text"
                  value={edit.changeSummary}
                  onChange={updateEdit('changeSummary')}
                  placeholder="Describe what changed in this version"
                />
              </div>

              <div className="form-field">
                <label htmlFor="oc-system-inventory">
                  System inventory{' '}
                  <span className="label-hint">(JSON array)</span>
                </label>
                <textarea
                  id="oc-system-inventory"
                  rows={8}
                  value={edit.systemInventoryJson}
                  onChange={updateEdit('systemInventoryJson')}
                  className="code-textarea"
                  spellCheck={false}
                />
              </div>

              <div className="form-field">
                <label htmlFor="oc-entitlements">
                  Entitlements{' '}
                  <span className="label-hint">(JSON array)</span>
                </label>
                <textarea
                  id="oc-entitlements"
                  rows={8}
                  value={edit.entitlementsJson}
                  onChange={updateEdit('entitlementsJson')}
                  className="code-textarea"
                  spellCheck={false}
                />
              </div>

              <div className="form-field">
                <label htmlFor="oc-custom-instructions">
                  Custom instructions{' '}
                  <span className="label-hint">(JSON array)</span>
                </label>
                <textarea
                  id="oc-custom-instructions"
                  rows={8}
                  value={edit.customInstructionsJson}
                  onChange={updateEdit('customInstructionsJson')}
                  className="code-textarea"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <div className="version-editor">
              <p className="placeholder-note">Select a version to edit.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
