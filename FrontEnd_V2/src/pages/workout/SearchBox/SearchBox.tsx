import { Search, XLg } from "react-bootstrap-icons";

import "./SearchBox.scss";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}

export function SearchBox({ value, onChange, placeholder, label }: SearchBoxProps) {
  return (
    <label className="wk-search">
      <Search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}>
          <XLg size={11} />
        </button>
      )}
    </label>
  );
}
