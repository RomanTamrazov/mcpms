'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type OptionItem = { value: string; label: React.ReactNode; text: string };

type SelectProps = {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function readOptions(children: React.ReactNode): OptionItem[] {
  const items: OptionItem[] = [];
  React.Children.toArray(children).forEach((child) => {
    if (!React.isValidElement<{ value?: string | number; children?: React.ReactNode }>(child)) return;
    const text = textOf(child.props.children);
    items.push({
      value: child.props.value !== undefined ? String(child.props.value) : text,
      label: child.props.children,
      text,
    });
  });
  return items;
}


export function Select({ value, onChange, children, className, id, disabled, 'aria-label': ariaLabel }: SelectProps) {
  const options = React.useMemo(() => readOptions(children), [children]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const wanted = Math.min(320, options.length * 40 + 12);
    const up = spaceBelow < wanted && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(320, up ? spaceAbove : spaceBelow));
    const width = Math.max(rect.width, 180);
    const left = Math.min(rect.left, window.innerWidth - width - margin);
    setPosition({ top: up ? rect.top - gap : rect.bottom + gap, left: Math.max(margin, left), width, maxHeight, up });
  }, [options.length]);

  const close = React.useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openList = () => {
    if (disabled) return;
    place();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange({ target: { value: option.value } });
    close();
  };

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    };
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      place();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place, close]);

  React.useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key.length === 1) {
      const letter = event.key.toLowerCase();
      const next = options.findIndex((option, index) => index > activeIndex && option.text.toLowerCase().startsWith(letter));
      const found = next >= 0 ? next : options.findIndex((option) => option.text.toLowerCase().startsWith(letter));
      if (found >= 0) setActiveIndex(found);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={cn('ui-select', open && 'is-open', selected?.value === '' && 'is-placeholder', className)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ui-select-value">{selected?.label}</span>
        <ChevronDown className="ui-select-chevron" size={16} aria-hidden="true" />
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn('ui-select-menu', position.up && 'is-up')}
          style={{
            left: position.left,
            minWidth: position.width,
            maxWidth: Math.max(position.width, Math.min(440, window.innerWidth - 24)),
            maxHeight: position.maxHeight,
            ...(position.up ? { bottom: window.innerHeight - position.top } : { top: position.top }),
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selected?.value;
            return (
              <div
                key={`${option.value}-${index}`}
                role="option"
                data-index={index}
                aria-selected={isSelected}
                className={cn('ui-select-option', index === activeIndex && 'is-active', option.value === '' && 'is-placeholder')}
                tabIndex={-1}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choose(index);
                  }
                }}
              >
                <span>{option.label}</span>
                {isSelected && option.value !== '' && <Check size={15} aria-hidden="true" />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
