import { useEffect, useRef } from "react";

/** Keep the native color input's DOM value untouched during its own color dialog interaction. */
export function StableColorInput({ value, onChange, ...props }: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialValue = useRef(value);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current && inputRef.current) {
      inputRef.current.value = value;
      lastEmitted.current = value;
    }
  }, [value]);

  return <input {...props} ref={inputRef} type="color" defaultValue={initialValue.current} onChange={(event) => {
    lastEmitted.current = event.currentTarget.value;
    onChange(event.currentTarget.value);
  }} />;
}
