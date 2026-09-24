"use client";

import { useRef, useState, type ComponentProps } from "react";
import { SmileIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { EMOJI_GROUPS, searchEmojis } from "@/lib/emojis";
import { cn } from "@/lib/utils";

const RECENT_KEY = "fila-atic:recent-emojis";
const MAX_RECENT = 16;

const readRecent = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const rememberEmoji = (emoji: string) => {
  try {
    const next = [emoji, ...readRecent().filter((item) => item !== emoji)];
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    // no storage (private window): the picker just does not remember
  }
};

// Writes `text` where the cursor of a text field is (or replaces the
// selection) and tells React, so controlled and react-hook-form fields both
// see it as if it had been typed.
export function insertTextAtCursor(
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;

  field.focus();
  field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function PickerBody({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState(EMOJI_GROUPS[0].id);
  // read once when the popover opens (the body mounts with it)
  const [recent] = useState(readRecent);

  const searching = query.trim().length > 0;
  const group = EMOJI_GROUPS.find((item) => item.id === groupId)!;
  const emojis = searching ? searchEmojis(query) : group.emojis;

  return (
    <div className="grid gap-2">
      <Input
        value={query}
        placeholder="Buscar (ex.: ok, prazo, bug)"
        aria-label="Buscar emoji"
        className="h-7 text-xs"
        onChange={(event) => setQuery(event.target.value)}
      />
      {searching ? null : (
        <div className="flex flex-wrap gap-0.5" role="tablist">
          {EMOJI_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === groupId}
              title={item.label}
              onClick={() => setGroupId(item.id)}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-base hover:bg-accent",
                item.id === groupId && "bg-accent",
              )}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      {!searching && recent.length ? (
        <div className="grid gap-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            Recentes
          </p>
          <EmojiGrid emojis={recent} onPick={onPick} />
        </div>
      ) : null}
      <div className="grid gap-1">
        <p className="text-[11px] font-medium text-muted-foreground">
          {searching ? "Resultados" : group.label}
        </p>
        {emojis.length ? (
          <EmojiGrid emojis={emojis} onPick={onPick} scroll />
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum emoji encontrado.
          </p>
        )}
      </div>
    </div>
  );
}

function EmojiGrid({
  emojis,
  onPick,
  scroll = false,
}: {
  emojis: string[];
  onPick: (emoji: string) => void;
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-8 gap-0.5",
        scroll && "max-h-44 overflow-y-auto pr-1",
      )}
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`Emoji ${emoji}`}
          onClick={() => onPick(emoji)}
          className="flex size-7 items-center justify-center rounded-md text-lg hover:bg-accent"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// A button that opens the emoji keyboard. `onPick` receives the chosen emoji;
// wrap a field with EmojiTextarea/EmojiInput below to have it typed in.
export function EmojiButton({
  onPick,
  disabled = false,
  className,
  label = "Inserir emoji",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={disabled}
          aria-label={label}
          title={label}
          className={cn("text-muted-foreground", className)}
          // keep the caret of the field: the button must not take the focus
          onMouseDown={(event) => event.preventDefault()}
        >
          <SmileIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align="end"
        // give the focus back to the field instead of the trigger
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <PickerBody
          onPick={(emoji) => {
            rememberEmoji(emoji);
            onPick(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// The field lives inside the wrapper, so the wrapper finds it when an emoji
// is picked; the caller's own ref (react-hook-form's, for instance) goes
// straight to the field untouched.
const fieldIn = <T extends HTMLElement>(wrapper: HTMLElement | null, tag: string) =>
  wrapper?.querySelector<T>(tag) ?? null;

// Textarea with an emoji button in the corner.
export function EmojiTextarea({
  className,
  disabled,
  ...props
}: ComponentProps<typeof Textarea>) {
  const wrapper = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapper} className="relative min-w-0">
      <Textarea disabled={disabled} className={cn("pe-8", className)} {...props} />
      <EmojiButton
        disabled={disabled}
        className="absolute end-1.5 top-1.5"
        onPick={(emoji) => {
          const field = fieldIn<HTMLTextAreaElement>(wrapper.current, "textarea");
          if (field) insertTextAtCursor(field, emoji);
        }}
      />
    </div>
  );
}

// Single-line input with an emoji button on the right.
export function EmojiInput({
  className,
  disabled,
  ...props
}: ComponentProps<typeof Input>) {
  const wrapper = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapper} className="relative min-w-0">
      <Input disabled={disabled} className={cn("pe-8", className)} {...props} />
      <EmojiButton
        disabled={disabled}
        className="absolute end-1.5 top-1/2 -translate-y-1/2"
        onPick={(emoji) => {
          const field = fieldIn<HTMLInputElement>(wrapper.current, "input");
          if (field) insertTextAtCursor(field, emoji);
        }}
      />
    </div>
  );
}
