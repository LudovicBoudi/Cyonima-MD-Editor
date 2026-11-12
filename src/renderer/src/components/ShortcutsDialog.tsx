import { Keyboard } from 'lucide-react'
import { MARKDOWN_SYNTAX, SHORTCUT_GROUPS } from '../lib/shortcuts'
import { Modal } from './Modal'

interface ShortcutsDialogProps {
  onClose: () => void
}

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
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
          <h2 id="shortcuts-title">Raccourcis et syntaxe</h2>
          <p>Sous macOS, Ctrl correspond à ⌘. Fermez ce panneau avec Échap.</p>
        </div>
      </div>

      <div className="shortcut-columns">
        <div className="shortcut-column">
          {SHORTCUT_GROUPS.map((group) => (
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
            <h3>Syntaxe Markdown reconnue</h3>
            <p className="shortcut-note">
              Tapée pendant la rédaction ou lue à l’ouverture d’un fichier.
            </p>
            <dl>
              {MARKDOWN_SYNTAX.map((entry) => (
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
