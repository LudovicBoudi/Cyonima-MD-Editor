import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useI18n } from '../lib/i18n'

interface FindReplaceBarProps {
  term: string
  onTermChange: (value: string) => void
  caseSensitive: boolean
  onToggleCase: () => void
  regex: boolean
  onToggleRegex: () => void
  matchCount: number
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  replaceTerm: string
  onReplaceTermChange: (value: string) => void
  onReplace: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function FindReplaceBar({
  term,
  onTermChange,
  caseSensitive,
  onToggleCase,
  regex,
  onToggleRegex,
  matchCount,
  currentIndex,
  onPrev,
  onNext,
  replaceTerm,
  onReplaceTermChange,
  onReplace,
  onReplaceAll,
  onClose
}: FindReplaceBarProps) {
  const { t } = useI18n()
  const counter = matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : '0'

  const onTermKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onNext()
    }
  }

  const onReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onReplace()
    }
  }

  return (
    <div className="find-bar" role="search">
      <div className="find-group">
        <input
          className="find-input"
          type="text"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          onKeyDown={onTermKeyDown}
          placeholder={t('find.placeholder')}
          aria-label={t('find.placeholder')}
          autoFocus
        />
        <span
          className={`find-counter${matchCount === 0 ? ' is-empty' : ''}`}
          title={t('find.results')}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden="true">{counter}</span>
          <span className="sr-only">
            {matchCount > 0
              ? t('find.resultOf', { index: currentIndex + 1, count: matchCount })
              : t('find.noResults')}
          </span>
        </span>
        <button type="button" className="find-button" onClick={onPrev} title={t('find.previous')} aria-label={t('find.previous')}>
          <ChevronUp size={15} strokeWidth={2} />
        </button>
        <button type="button" className="find-button" onClick={onNext} title={t('find.next')} aria-label={t('find.next')}>
          <ChevronDown size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`find-toggle${caseSensitive ? ' is-active' : ''}`}
          onClick={onToggleCase}
          title={t('find.case')}
          aria-label={t('find.case')}
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
        <button
          type="button"
          className={`find-toggle${regex ? ' is-active' : ''}`}
          onClick={onToggleRegex}
          title={t('find.regexTitle')}
          aria-label={t('find.regex')}
          aria-pressed={regex}
        >
          .*
        </button>
      </div>

      <div className="find-group">
        <input
          className="find-input find-input--replace"
          type="text"
          value={replaceTerm}
          onChange={(event) => onReplaceTermChange(event.target.value)}
          onKeyDown={onReplaceKeyDown}
          placeholder={t('find.replacePlaceholder')}
          aria-label={t('find.replacePlaceholder')}
        />
        <button
          type="button"
          className="find-button find-button--text"
          onClick={onReplace}
          disabled={matchCount === 0}
          aria-label={t('find.replaceOne')}
        >
          <Replace size={14} strokeWidth={2} />
          {t('find.replace')}
        </button>
        <button
          type="button"
          className="find-button find-button--text"
          onClick={onReplaceAll}
          disabled={matchCount === 0}
          aria-label={t('find.replaceAllLabel')}
        >
          {t('find.replaceAll')}
        </button>
      </div>

      <button type="button" className="find-button" onClick={onClose} title={t('find.closeTitle')} aria-label={t('find.close')}>
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
