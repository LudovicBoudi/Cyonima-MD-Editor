import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, FileText, Target } from 'lucide-react'
import type { FileFormat } from '../../../shared/types'
import { normalizeWordGoal, WORD_GOAL_MAX, WORD_GOAL_MIN } from '../../../shared/wordGoal'
import type { CaretPosition, TextStats } from '../lib/documentStats'

export interface CursorInfo {
  position: CaretPosition
  /** Counts for the current selection, or null when nothing is selected. */
  selection: TextStats | null
}

interface StatusBarProps {
  words: number
  characters: number
  cursor: CursorInfo
  wordGoal: number | null
  onWordGoalChange: (goal: number | null) => void
  documentPath: string | null
  dirty: boolean
  justSaved: boolean
  format: FileFormat
}

const ENCODING_LABELS: Record<FileFormat['encoding'], string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE'
}

const WORDS_PER_MINUTE = 200

export function StatusBar({
  words,
  characters,
  cursor,
  wordGoal,
  onWordGoalChange,
  documentPath,
  dirty,
  justSaved,
  format
}: StatusBarProps) {
  const [editingGoal, setEditingGoal] = useState(false)
  const goalInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingGoal) goalInputRef.current?.focus()
  }, [editingGoal])

  const commitGoal = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '') onWordGoalChange(null)
    else {
      const goal = normalizeWordGoal(Number(trimmed))
      if (goal !== null) onWordGoalChange(goal)
    }
    setEditingGoal(false)
  }

  const readingMinutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
  const formatLabel = `${ENCODING_LABELS[format.encoding]}${format.bom ? ' BOM' : ''} · ${format.eol.toUpperCase()}`
  const progress = wordGoal ? Math.min(1, words / wordGoal) : 0
  const remaining = wordGoal ? Math.max(0, wordGoal - words) : 0
  const { position, selection } = cursor
  const stateLabel = dirty ? 'Modifications non enregistrées' : justSaved ? 'Enregistré' : 'Prêt'

  return (
    <footer className="status-bar">
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stateLabel}
      </span>
      <div className="status-left">
        {dirty ? (
          <span className="status-item status-item--warning">
            <CircleAlert size={13} strokeWidth={2} />
            Modifications non enregistrées
          </span>
        ) : justSaved ? (
          <span className="status-item status-item--success">
            <Check size={13} strokeWidth={2.2} />
            Enregistré
          </span>
        ) : (
          <span className="status-item">
            <Check size={13} strokeWidth={2.2} />
            Prêt
          </span>
        )}
        <span className="status-divider" />
        <span className="status-item status-path" title={documentPath ?? 'Document non enregistré'}>
          <FileText size={13} strokeWidth={1.8} />
          {documentPath ?? 'Brouillon non enregistré'}
        </span>
      </div>

      <div className="status-right">
        {selection && (
          <>
            <span className="status-item status-item--accent">
              {selection.words.toLocaleString('fr-FR')} mot{selection.words > 1 ? 's' : ''}{' '}
              sélectionné{selection.words > 1 ? 's' : ''} ·{' '}
              {selection.characters.toLocaleString('fr-FR')} caractère
              {selection.characters > 1 ? 's' : ''}
            </span>
            <span className="status-divider" />
          </>
        )}

        <span className="status-item" title={`Ligne ${position.line}, colonne ${position.column}`}>
          Ligne {position.line.toLocaleString('fr-FR')}, col. {position.column.toLocaleString('fr-FR')}
        </span>
        <span className="status-divider" />

        {editingGoal ? (
          <input
            ref={goalInputRef}
            type="number"
            className="status-goal-input"
            aria-label="Objectif de mots"
            placeholder="Objectif"
            min={WORD_GOAL_MIN}
            max={WORD_GOAL_MAX}
            defaultValue={wordGoal ?? ''}
            onBlur={(event) => commitGoal(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitGoal(event.currentTarget.value)
              if (event.key === 'Escape') setEditingGoal(false)
            }}
          />
        ) : (
          <button
            type="button"
            className="status-item status-goal"
            title="Définir un objectif de mots (vide pour le retirer)"
            onClick={() => setEditingGoal(true)}
          >
            {wordGoal ? (
              <>
                <span>
                  {words.toLocaleString('fr-FR')} / {wordGoal.toLocaleString('fr-FR')} mots
                </span>
                <span className="status-progress" aria-hidden="true">
                  <span className="status-progress-fill" style={{ width: `${progress * 100}%` }} />
                </span>
              </>
            ) : (
              <>
                <Target size={12} strokeWidth={2} aria-hidden="true" />
                <span>
                  {words.toLocaleString('fr-FR')} mot{words > 1 ? 's' : ''}
                </span>
              </>
            )}
          </button>
        )}
        <span className="status-divider" />
        <span className="status-item">
          {characters.toLocaleString('fr-FR')} caractère{characters > 1 ? 's' : ''}
        </span>
        <span className="status-divider" />
        {wordGoal ? (
          <span className={`status-item${remaining === 0 ? ' status-item--success' : ''}`}>
            {remaining === 0
              ? 'Objectif atteint'
              : `reste ${remaining.toLocaleString('fr-FR')} mot${remaining > 1 ? 's' : ''} · ~${Math.ceil(remaining / WORDS_PER_MINUTE)} min`}
          </span>
        ) : (
          <span className="status-item">~{readingMinutes} min de lecture</span>
        )}
        <span className="status-divider" />
        <span
          className="status-item"
          title="Encodage et fins de ligne qui seront utilisés à l’enregistrement"
        >
          {formatLabel}
        </span>
        <span className="status-divider" />
        <span className="status-badge">Markdown</span>
      </div>
    </footer>
  )
}
