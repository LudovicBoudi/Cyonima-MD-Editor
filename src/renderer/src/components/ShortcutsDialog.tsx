import { Keyboard } from 'lucide-react'
import { buildMarkdownSyntax, buildShortcutGroups } from '../lib/shortcuts'
import { useI18n } from '../lib/i18n'
import { Modal } from './Modal'

interface ShortcutsDialogProps {
  onClose: () => void
}

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const { t, language } = useI18n()
  const groups = buildShortcutGroups(t, language)
  const syntax = buildMarkdownSyntax(t, language)

  return (
    <Modal
      labelledBy="shortcuts-title"
      className="dialog--wide"
      onClose={onClose}
      closeOnBackdrop
    >
      <div className="dialog-heading">
        <span className="dialog-icon">
          <Keyboard size={18} strokeWidth={1.9} />
        </span>
        <div>
          <h2 id="shortcuts-title">{t('shortcuts.title')}</h2>
          <p>{t('shortcuts.note')}</p>
        </div>
      </div>

      <div className="shortcut-columns">
        <div className="shortcut-column">
          {groups.map((group) => (
            <section key={group.title} className="shortcut-group">
              <h3>{group.title}</h3>
              <dl>
                {group.entries.map((entry) => (
                  <div key={entry.label} className="shortcut-row">
                    <dt>{entry.label}</dt>
                    <dd>
                      <kbd>{entry.keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="shortcut-column">
          <section className="shortcut-group">
            <h3>{t('shortcuts.markdownTitle')}</h3>
            <p className="shortcut-note">{t('shortcuts.markdownNote')}</p>
            <dl>
              {syntax.map((entry) => (
                <div key={entry.label} className="shortcut-row shortcut-row--syntax">
                  <dt>{entry.label}</dt>
                  <dd>
                    <code>{entry.keys}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </Modal>
  )
}
