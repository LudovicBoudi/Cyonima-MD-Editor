import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, FileText, Target } from 'lucide-react'
import type { FileFormat } from '../../../shared/types'
import { normalizeWordGoal, WORD_GOAL_MAX, WORD_GOAL_MIN } from '../../../shared/wordGoal'
import { pluralKey } from '../../../shared/i18n'
import { useI18n } from '../lib/i18n'
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
  const { t, locale } = useI18n()
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

  const number = (value: number) => value.toLocaleString(locale)
  const readingMinutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
  const formatLabel = `${ENCODING_LABELS[format.encoding]}${format.bom ? ' BOM' : ''} · ${format.eol.toUpperCase()}`
  const progress = wordGoal ? Math.min(1, words / wordGoal) : 0
  const remaining = wordGoal ? Math.max(0, wordGoal - words) : 0
  const { position, selection } = cursor
  const stateLabel = dirty
    ? t('status.unsaved')
    : justSaved
      ? t('status.saved')
      : t('status.ready')

  return (
    <footer className="status-bar">
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {stateLabel}
      </span>
      <div className="status-left">
        {dirty ? (
          <span className="status-item status-item--warning">
            <CircleAlert size={13} strokeWidth={2} />
            {t('status.unsaved')}
          </span>
        ) : justSaved ? (
          <span className="status-item status-item--success">
            <Check size={13} strokeWidth={2.2} />
            {t('status.saved')}
          </span>
        ) : (
          <span className="status-item">
            <Check size={13} strokeWidth={2.2} />
            {t('status.ready')}
          </span>
        )}
        <span className="status-divider" />
        <span
          className="status-item status-path"
          title={documentPath ?? t('status.pathTitleUnsaved')}
        >
          <FileText size={13} strokeWidth={1.8} />
          {documentPath ?? t('status.draft')}
        </span>
      </div>

      <div className="status-right">
        {selection && (
          <>
            <span className="status-item status-item--accent">
              {t(pluralKey('status.selectionWordsOne', 'status.selectionWordsOther', selection.words), {
                count: number(selection.words)
              })}{' '}
              ·{' '}
              {t(
                pluralKey(
                  'status.selectionCharactersOne',
                  'status.selectionCharactersOther',
                  selection.characters
                ),
                { count: number(selection.characters) }
              )}
            </span>
            <span className="status-divider" />
          </>
        )}

        <span
          className="status-item"
          title={t('status.lineColumn', {
            line: number(position.line),
            column: number(position.column)
          })}
        >
          {t('status.lineColumn', {
            line: number(position.line),
            column: number(position.column)
          })}
        </span>
        <span className="status-divider" />

        {editingGoal ? (
          <input
            ref={goalInputRef}
            type="number"
            className="status-goal-input"
            aria-label={t('status.goalLabel')}
            placeholder={t('status.goalPlaceholder')}
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
            title={t('status.goalTitle')}
            onClick={() => setEditingGoal(true)}
          >
            {wordGoal ? (
              <>
                <span>
                  {t('status.goalProgress', { words: number(words), goal: number(wordGoal) })}
                </span>
                <span className="status-progress" aria-hidden="true">
                  <span className="status-progress-fill" style={{ width: `${progress * 100}%` }} />
                </span>
              </>
            ) : (
              <>
                <Target size={12} strokeWidth={2} aria-hidden="true" />
                <span>
                  {t(pluralKey('common.wordsOne', 'common.wordsOther', words), {
                    count: number(words)
                  })}
                </span>
              </>
            )}
          </button>
        )}
        <span className="status-divider" />
        <span className="status-item">
          {t(pluralKey('common.charactersOne', 'common.charactersOther', characters), {
            count: number(characters)
          })}
        </span>
        <span className="status-divider" />
        {wordGoal ? (
          <span className={`status-item${remaining === 0 ? ' status-item--success' : ''}`}>
            {remaining === 0
              ? t('status.goalReached')
              : t(pluralKey('status.remainingOne', 'status.remainingOther', remaining), {
                  count: number(remaining),
                  minutes: Math.ceil(remaining / WORDS_PER_MINUTE)
                })}
          </span>
        ) : (
          <span className="status-item">
            {t('status.readingTime', { count: readingMinutes })}
          </span>
        )}
        <span className="status-divider" />
        <span className="status-item" title={t('status.formatTitle')}>
          {formatLabel}
        </span>
        <span className="status-divider" />
        <span className="status-badge">Markdown</span>
      </div>
    </footer>
  )
}
