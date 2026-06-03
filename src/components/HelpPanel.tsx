import { useEffect, useRef } from "react";
import type { HelpContent } from "../helpContent";

type HelpPanelProps = {
  isOpen: boolean;
  activeTabLabel: string;
  content: HelpContent;
  onClose: () => void;
};

function HelpPanel({ isOpen, activeTabLabel, content, onClose }: HelpPanelProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="help-drawer" role="presentation">
      <button
        type="button"
        className="help-drawer__backdrop"
        aria-label="Close help panel"
        onClick={onClose}
      />
      <aside
        className="help-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-drawer-title"
      >
        <header className="help-drawer__header">
          <div>
            <h2 id="help-drawer-title">{content.title}</h2>
          </div>
          <button
            type="button"
            className="help-drawer__close"
            onClick={onClose}
            ref={closeButtonRef}
          >
            Close
          </button>
        </header>

        <div className="help-drawer__body">
          <p className="help-drawer__intro">{content.intro}</p>

          {content.sections.map((section) => (
            <section className="help-drawer__section" key={section.title}>
              <h3>{section.title}</h3>
              {section.body ? <p>{section.body}</p> : null}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
              {section.links ? (
                <div className="help-drawer__links">
                  {section.links.map((link) => (
                    <a
                      href={link.href}
                      key={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default HelpPanel;
