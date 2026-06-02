import { useMemo, useState } from "react";
import { exportScopeLabels, exportScopeOrder } from "../chartUtils";
import type { ExportScope } from "../types";

type ExportScopeMultiSelectProps = {
  availableScopes?: ExportScope[];
  selectedScopes: ExportScope[];
  onChange: (nextScopes: ExportScope[]) => void;
  label?: string;
};

function ExportScopeMultiSelect({
  availableScopes = exportScopeOrder,
  selectedScopes,
  onChange,
  label = "Export scope",
}: ExportScopeMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedScopes), [selectedScopes]);
  const summary = useMemo(() => {
    if (selectedScopes.length === 0) {
      return "No export scopes";
    }

    if (
      availableScopes.length > 0 &&
      selectedScopes.length === availableScopes.length
    ) {
      return "All export scopes";
    }

    if (selectedScopes.length === 1) {
      return exportScopeLabels[selectedScopes[0]];
    }

    return `${selectedScopes.length} export scopes`;
  }, [availableScopes.length, selectedScopes]);

  function toggleScope(scope: ExportScope) {
    if (selectedSet.has(scope)) {
      onChange(selectedScopes.filter((item) => item !== scope));
      return;
    }

    onChange([
      ...selectedScopes.filter((item) => availableScopes.includes(item)),
      scope,
    ]);
  }

  function selectAll() {
    onChange([
      ...selectedScopes.filter((item) => availableScopes.includes(item)),
      ...availableScopes.filter((scope) => !selectedSet.has(scope)),
    ]);
  }

  return (
    <div className="field country-multiselect export-scope-multiselect">
      <span>{label}</span>
      <div className="country-multiselect__control">
        <button
          type="button"
          className="country-multiselect__button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span>{summary}</span>
          <span aria-hidden="true">▾</span>
        </button>

        {isOpen ? (
          <div className="country-multiselect__panel">
            <div className="country-multiselect__actions">
              <button type="button" onClick={selectAll}>
                Select all
              </button>
              <button type="button" onClick={() => onChange([])}>
                Clear
              </button>
            </div>

            <div className="country-multiselect__options">
              {availableScopes.map((scope) => (
                <label className="country-multiselect__option" key={scope}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(scope)}
                    onChange={() => toggleScope(scope)}
                  />
                  <span>{exportScopeLabels[scope]}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ExportScopeMultiSelect;
