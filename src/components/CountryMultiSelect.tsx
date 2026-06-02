import { useMemo, useState } from "react";

type CountryMultiSelectProps = {
  countries: string[];
  selectedCountries: string[];
  onChange: (nextCountries: string[]) => void;
  label?: string;
};

function CountryMultiSelect({
  countries,
  selectedCountries,
  onChange,
  label = "Country",
}: CountryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedSet = useMemo(
    () => new Set(selectedCountries),
    [selectedCountries],
  );
  const summary = useMemo(() => {
    if (selectedCountries.length === 0) {
      return "No countries";
    }

    if (countries.length > 0 && selectedCountries.length === countries.length) {
      return "All Available Countries";
    }

    if (selectedCountries.length === 1) {
      return selectedCountries[0];
    }

    return `${selectedCountries.length} countries`;
  }, [countries.length, selectedCountries]);

  function toggleCountry(country: string) {
    if (selectedSet.has(country)) {
      onChange(selectedCountries.filter((item) => item !== country));
      return;
    }

    onChange([
      ...selectedCountries.filter((item) => countries.includes(item)),
      country,
    ]);
  }

  function selectAll() {
    onChange([
      ...selectedCountries.filter((item) => countries.includes(item)),
      ...countries.filter((country) => !selectedSet.has(country)),
    ]);
  }

  return (
    <div className="field country-multiselect">
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
              {countries.map((country) => (
                <label className="country-multiselect__option" key={country}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(country)}
                    onChange={() => toggleCountry(country)}
                  />
                  <span>{country}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CountryMultiSelect;
