'use client';
import { TableResponseSchema, type TableDto, type TableWrite } from '@tabletap/shared';
import { Badge, Button, Input, Label, cn } from '@tabletap/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { clientFetch } from '../../lib/api';
import { randomUuid } from '../../lib/uuid';
import { ROW_HEAD, ROW_LINE } from './menu-row';
import { QrActions } from './qr-actions';
import {
  OkResponseSchema,
  RowActions,
  RowNotice,
  asJson,
  deleteRefusal,
  refusal,
} from './row-editor';

const TABLE_COLUMNS = 4;

const IN_USE = 'This table has orders. Deactivate it instead.';
const INCOMPLETE = "Couldn't save. Give the table a number and a label.";

const DEFAULT_SEATS = 4;

type Draft = { number: string; label: string; seats: string };

const draftOf = (table: TableDto): Draft => ({
  number: String(table.number),
  label: table.label,
  seats: String(table.seats),
});

const emptyTable = (id: string, number: number): TableDto => ({
  id,
  number,
  label: '',
  seats: DEFAULT_SEATS,
  isActive: true,
});

/**
 * The room, as the operator has it laid out. Same shape as the menu: one row open at a time, edited
 * where it is read, and the row that closes hands focus back to the control that opened it.
 *
 * The QR belongs to this screen rather than to the menu because it is the thing a table *is* to a
 * guest — the sheet prints one card per active table, and reissuing a code revokes every card
 * already printed for it, which is why that one control asks first.
 */
export function TablesTable({
  initial,
  fetcher = clientFetch,
}: {
  initial: TableDto[];
  fetcher?: typeof clientFetch;
}) {
  const [tables, setTables] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  const withoutDraft = (list: TableDto[]) =>
    draftId === null ? list : list.filter((table) => table.id !== draftId);

  const open = (id: string) => {
    if (draftId !== null && draftId !== id) setTables(withoutDraft);
    if (draftId !== id) setDraftId(null);
    setClosed(null);
    setEditing(id);
  };
  const close = () => {
    setTables(withoutDraft);
    setDraftId(null);
    setEditing(null);
    setClosed(editing);
  };

  const addTable = () => {
    const id = randomUuid();
    // Counted over the saved tables only: an abandoned draft is about to be thrown away, and
    // letting it raise the number would leave a gap in the room's numbering for no reason.
    const saved = withoutDraft(tables);
    const next = saved.reduce((top, table) => Math.max(top, table.number), 0) + 1;
    setTables([...saved, emptyTable(id, next)]);
    setDraftId(id);
    setEditing(id);
  };

  const ordered = [...tables].sort((a, b) => a.number - b.number);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Tables</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* A link, not a button that fetches: the route answers `content-disposition:
              attachment`, so the browser saves it without leaving this page, and the staff cookie
              rides along the way it does on any same-origin request. */}
          <Button asChild variant="outline">
            <a href="/api/tables/qr.pdf">Print QR sheet</a>
          </Button>
          <Button type="button" onClick={addTable}>
            Add table
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-sm">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <caption className="sr-only">Tables in number order, with the state of each</caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="w-full px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Table
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Seats
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                State
              </th>
              <th scope="col" className="relative px-3 py-2">
                <span className="sr-only">Row controls</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((table) => (
              <TableRow
                key={table.id}
                table={table}
                editing={editing === table.id}
                isNew={draftId === table.id}
                fetcher={fetcher}
                focusOnRead={closed === table.id}
                onEdit={() => open(table.id)}
                onCancel={close}
                onToggled={(saved) =>
                  setTables((list) =>
                    list.map((current) => (current.id === table.id ? saved : current)),
                  )
                }
                onSaved={(saved) => {
                  setTables((list) =>
                    list.map((current) => (current.id === table.id ? saved : current)),
                  );
                  setDraftId(null);
                  setEditing(null);
                  setClosed(saved.id);
                }}
                onDeleted={() => {
                  setTables((list) => list.filter((current) => current.id !== table.id));
                  setDraftId(null);
                  setEditing(null);
                  setClosed(null);
                }}
              />
            ))}
            {ordered.length === 0 ? (
              <tr className={ROW_LINE}>
                <td colSpan={TABLE_COLUMNS} className="px-3">
                  <span className="text-sm text-muted-foreground">No tables yet.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RowProps = {
  table: TableDto;
  editing: boolean;
  isNew: boolean;
  fetcher: typeof clientFetch;
  focusOnRead: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** A row closed on what the server answered: replace it, and give its focus back. */
  onSaved: (table: TableDto) => void;
  /** A one-press state change: replace the row and leave the hand where it was. */
  onToggled: (table: TableDto) => void;
  onDeleted: () => void;
};

function TableRow(props: RowProps) {
  if (!props.editing) return <ReadRow {...props} />;
  // Mounted only while this row is the open one, so the draft is seeded from the table every time
  // editing starts and an abandoned draft goes away with the component that held it.
  return <EditRow {...props} />;
}

function ReadRow({ table, fetcher, focusOnRead, onEdit, onToggled }: RowProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const edit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnRead) edit.current?.focus();
  }, [focusOnRead]);

  // One press, no draft: taking a table out of service is what an operator does when a table is
  // being repaired or pushed together with another, and it is entirely reversible.
  //
  // It reports through `onToggled`, not through the `onSaved` that closes an editor: this press
  // opened no row, so there is no focus to hand back. Borrowing `onSaved` would move the hand to
  // `Edit` after every press, and a second Space — meant to put the table back — would open the
  // editor instead of re-toggling. The control stays where it was and only its word changes.
  const setActive = async (isActive: boolean) => {
    setBusy(true);
    setNotice('');
    try {
      const { table: saved } = await fetcher(`/api/tables/${table.id}`, {
        schema: TableResponseSchema,
        init: asJson('PATCH', { isActive }),
      });
      onToggled(saved);
    } catch (error) {
      setNotice(refusal(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={ROW_LINE}>
      <th scope="row" className={cn(ROW_HEAD, 'border-transparent')}>
        <span className="block truncate text-sm font-semibold">Table {table.number}</span>
        {/* The label earns its line only when it says something the number does not: a restaurant
            that never renamed its tables would otherwise read "Table 4" twice in every row. */}
        {table.label === '' || table.label === `Table ${table.number}` ? null : (
          <span className="block truncate text-sm text-muted-foreground">{table.label}</span>
        )}
      </th>
      <td className="px-3 text-right font-mono text-sm whitespace-nowrap">{table.seats}</td>
      <td className="px-3">
        {/* Active is the quiet case; out of service is the exception an operator scans for, so
            only that one wears a chip. The same rule the menu applies to a sold-out dish. */}
        {table.isActive ? (
          <span className="text-sm text-muted-foreground">Active</span>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        )}
      </td>
      {/* A minimum the three controls fit on one line in. The first column is `w-full` and takes
          everything it is allowed to, so without this the controls column collapses to the width
          of its widest button, `Reissue QR` wraps under the other two in every row, and the
          confirmation's sentence wraps four times in a column too narrow to read it in. */}
      <td className="min-w-80 px-3 text-right">
        {/* Mounted by the press, before there is anything to say: the refusal belongs beside the
            control that was refused, and a live region that appears with its text already in it may
            never be announced. It sits outside `QrActions` rather than among the controls it hands
            over, because the reissue question takes those controls away — and a refusal that
            arrives while the question stands would otherwise be written into an unmounted
            paragraph, then re-appear later with its text already in it. */}
        {busy || notice !== '' ? (
          <p role="status" aria-live="polite" className="mb-1 text-sm text-destructive">
            {notice}
          </p>
        ) : null}
        <QrActions table={table} fetcher={fetcher}>
          <Button type="button" ref={edit} variant="outline" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => void setActive(!table.isActive)}
          >
            {table.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </QrActions>
      </td>
    </tr>
  );
}

function EditRow({ table, isNew, fetcher, onCancel, onSaved, onDeleted }: RowProps) {
  const numberId = useId();
  const labelId = useId();
  const seatsId = useId();
  const [draft, setDraft] = useState(() => draftOf(table));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState(false);

  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    const label = draft.label.trim();
    const number = Number(draft.number);
    const seats = Number(draft.seats);
    if (
      label === '' ||
      !Number.isInteger(number) ||
      number < 1 ||
      !Number.isInteger(seats) ||
      seats < 1
    ) {
      setInvalid(true);
      setNotice(INCOMPLETE);
      return;
    }
    setInvalid(false);
    const body: Partial<TableWrite> = {};
    if (isNew) {
      body.number = number;
      body.label = label;
      body.seats = seats;
      body.isActive = true;
    } else {
      if (number !== table.number) body.number = number;
      if (label !== table.label) body.label = label;
      if (seats !== table.seats) body.seats = seats;
      // Nothing moved, so there is nothing to ask the server about: close the row.
      if (Object.keys(body).length === 0) return onCancel();
    }
    setBusy(true);
    setNotice('');
    try {
      const { table: saved } = await fetcher(isNew ? '/api/tables' : `/api/tables/${table.id}`, {
        schema: TableResponseSchema,
        init: asJson(isNew ? 'POST' : 'PATCH', body),
      });
      onSaved(saved);
    } catch (error) {
      // The row must never sit showing values the server does not hold.
      setDraft(draftOf(table));
      setNotice(refusal(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew) return onCancel();
    setBusy(true);
    setNotice('');
    try {
      await fetcher(`/api/tables/${table.id}`, {
        schema: OkResponseSchema,
        init: { method: 'DELETE' },
      });
      onDeleted();
    } catch (error) {
      setNotice(deleteRefusal(error, IN_USE));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr className={cn(ROW_LINE, 'bg-secondary/60')}>
        <th scope="row" className={cn(ROW_HEAD, 'border-primary')}>
          <div className="flex items-center gap-2">
            <Label htmlFor={numberId} className="sr-only">
              Number
            </Label>
            <Input
              id={numberId}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              className="w-20 text-right font-mono"
              value={draft.number}
              aria-invalid={(invalid && !Number.isInteger(Number(draft.number))) || undefined}
              onChange={(event) => change({ number: event.target.value })}
            />
            <Label htmlFor={labelId} className="sr-only">
              Label
            </Label>
            {/* The label is what an operator came to change: the number is usually already right,
                and on a new table it has been filled in for them. */}
            <Input
              id={labelId}
              autoFocus
              value={draft.label}
              aria-invalid={(invalid && draft.label.trim() === '') || undefined}
              className="max-w-sm"
              onChange={(event) => change({ label: event.target.value })}
            />
          </div>
        </th>
        <td className="px-3 text-right">
          <Label htmlFor={seatsId} className="sr-only">
            Seats
          </Label>
          <Input
            id={seatsId}
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            className="w-20 text-right font-mono"
            value={draft.seats}
            aria-invalid={(invalid && !Number.isInteger(Number(draft.seats))) || undefined}
            onChange={(event) => change({ seats: event.target.value })}
          />
        </td>
        <td className="px-3">
          <span className="text-sm text-muted-foreground">
            {table.isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <RowActions busy={busy} onSave={() => void save()} onCancel={onCancel} />
      </tr>
      <tr className="border-b border-border/50 bg-secondary/60">
        <td colSpan={TABLE_COLUMNS} className="px-3 pb-4">
          <RowNotice notice={notice} />
          {/* Out of the row line, as on the menu: Edit is the deliberate act that unlocks it, and
              nothing destructive sits beside Save where a hand aiming for Save can reach it. */}
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
        </td>
      </tr>
    </>
  );
}
