import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, LoaderCircle, Check, AlertCircle, Circle } from 'lucide-react';
import { statusLabels } from '../core/types';

export function Button({
  children,
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <button
      type="button"
      className={`button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function IconButton(props: Parameters<typeof Button>[0]) {
  return <Button {...props} className={`icon-button ${props.className || ''}`} />;
}
export function Status({ status }: { status: string }) {
  const running = ['running', 'RUNNING', 'QUEUED', 'CANCEL_REQUESTED', 'GENERATING'].includes(
    status,
  );
  const failed = ['failed', 'FAILED', 'incomplete'].includes(status);
  const done = ['completed', 'SUCCEEDED', 'PUBLISHED'].includes(status);
  const Icon = running ? LoaderCircle : failed ? AlertCircle : done ? Check : Circle;
  return (
    <span className={`status ${running ? 'running' : failed ? 'failed' : done ? 'done' : ''}`}>
      <Icon className={running ? 'spin' : ''} size={13} />
      {statusLabels[status] || status}
    </span>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const root = ref.current!.getRootNode() as ShadowRoot;
    const previous = root.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() =>
      (
        ref.current?.querySelector('[autofocus],input,textarea,button') as HTMLElement | null
      )?.focus(),
    );
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ) || [],
      ).filter((node) => node.getClientRects().length);
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && root.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && root.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    ref.current?.addEventListener('keydown', listener);
    const node = ref.current;
    return () => {
      cancelAnimationFrame(frame);
      node?.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Code({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="code">
      <code>{text}</code>
    </pre>
  );
}
