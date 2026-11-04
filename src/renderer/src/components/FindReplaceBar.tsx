import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'

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
          placeholder="Rechercher"
          aria-label="Rechercher"
          autoFocus
        />
        <span className={`find-counter${matchCount === 0 ? ' is-empty' : ''}`} title="Résultats">
          {counter}
        </span>
        <button type="button" className="find-button" onClick={onPrev} title="Précédent" aria-label="Précédent">
          <ChevronUp size={15} strokeWidth={2} />
        </button>
        <button type="button" className="find-button" onClick={onNext} title="Suivant" aria-label="Suivant">
          <ChevronDown size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`find-toggle${caseSensitive ? ' is-active' : ''}`}
          onClick={onToggleCase}
          title="Respecter la casse"
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
        <button
          type="button"
          className={`find-toggle${regex ? ' is-active' : ''}`}
          onClick={onToggleRegex}
          title="Expression régulière"
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
          placeholder="Remplacer par"
          aria-label="Remplacer par"
        />
        <button type="button" className="find-button find-button--text" onClick={onReplace} disabled={matchCount === 0}>
          <Replace size={14} strokeWidth={2} />
          Remplacer
        </button>
        <button
          type="button"
          className="find-button find-button--text"
          onClick={onReplaceAll}
          disabled={matchCount === 0}
        >
          Tout
        </button>
      </div>

      <button type="button" className="find-button" onClick={onClose} title="Fermer (Échap)" aria-label="Fermer la recherche">
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  )
}
