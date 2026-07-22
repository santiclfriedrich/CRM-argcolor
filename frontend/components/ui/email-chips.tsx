"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

// Input de emails como "chips": se agrega cada uno con Enter/coma/espacio (o al
// salir del campo), sin necesidad de escribir comas. Cada chip se puede quitar.
export function EmailChips({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  id?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  const commit = (raw: string) => {
    const nuevos = raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!nuevos.length) return;
    const merged = [...value];
    for (const e of nuevos) {
      if (!merged.includes(e)) merged.push(e);
    }
    onChange(merged);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commit(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
      {value.map((email, i) => (
        <span
          key={`${email}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-xs text-ink"
        >
          {email}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="text-ink-3 transition hover:text-red-600"
            aria-label={`Quitar ${email}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="email"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(text)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
      />
    </div>
  );
}
