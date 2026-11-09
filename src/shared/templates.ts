/**
 * Starter content written to `userData/library` on first run. Each entry is
 * a plain Markdown file afterwards, so the user can edit or delete it.
 */
export const DEFAULT_TEMPLATES: Readonly<Record<string, string>> = {
  'Note de réunion': `# Réunion : sujet

**Date :** {{date}}

**Participants :** à compléter

## Ordre du jour

1. Point à traiter

## Décisions

- Décision prise

## Actions

- [ ] Action à confirmer
`,
  Article: `# Titre de l'article

*Chapeau : une phrase qui résume le propos.*

## Introduction

Texte d'introduction.

## Développement

### Premier point

Texte.

## Conclusion

Texte de conclusion.
`,
  README: `# Nom du projet

Description courte du projet.

## Installation

\`\`\`bash
npm install
\`\`\`

## Utilisation

Exemple d'utilisation.

## Licence

Licence du projet.
`
}

export const DEFAULT_SNIPPETS: Readonly<Record<string, string>> = {
  Date: '{{date}}',
  Heure: '{{heure}}',
  'Date et heure': '{{date}} {{heure}}'
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** "9 novembre 2026" */
export function formatFrenchDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** "14:05" — 24-hour clock, as used in French documents. */
export function formatFrenchTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Replaces `{{date}}` and `{{heure}}` with the current date and time. Other
 * text, including unknown placeholders, is left untouched.
 */
export function expandPlaceholders(content: string, now: Date = new Date()): string {
  return content
    .replace(/\{\{date\}\}/g, formatFrenchDate(now))
    .replace(/\{\{heure\}\}/g, formatFrenchTime(now))
}
