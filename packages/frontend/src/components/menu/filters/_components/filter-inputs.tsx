'use client';
import { ReactNode, useCallback, useRef, useMemo } from 'react';
import { useDisclosure } from '@/hooks/disclosure';
import { toast } from 'sonner';
import { arrayMove } from '@dnd-kit/sortable';
import { IconButton } from '../../../ui/button';
import { TextInput } from '../../../ui/text-input';
import { NumberInput } from '../../../ui/number-input';
import { Tooltip } from '../../../ui/tooltip';
import { Checkbox } from '../../../ui/checkbox';
import { SettingsCard } from '../../../shared/settings-card';
import { ImportModal } from '../../../shared/import-modal';
import {
  SyncedUrlInputs,
  type SyncConfig,
} from './synced-patterns';
import {
  isSyncedTag,
  parseSyncedUrl,
  makeSyncedTag,
  isManualSyncTagAttempt,
} from '../../../../utils/synced';
import {
  FaPlus,
  FaRegTrashAlt,
  FaFileExport,
  FaFileImport,
  FaArrowUp,
  FaArrowDown,
} from 'react-icons/fa';
import { UserData } from '@aiostreams/core';

/**
 * Check if a value is a manually entered sync tag (e.g. "<SYNCED: url>")
 * which is not allowed in expression inputs.
 */
function checkManualSyncTag(value: string): boolean {
  if (isManualSyncTagAttempt(value)) {
    toast.warning('Manual entry of synchronized tags is not allowed.');
    return true;
  }
  return false;
}

/**
 * Hook providing synced-URL utilities: `handleUrlAdded` to append a new
 * synced placeholder, and `existingUrls` for deduplication in the add form.
 * It also provides `isSynced` and `getSyncedUrl` helpers for rendering.
 *
 * Legacy URL migration is handled at the data boundary in `Content()`.
 */
function useSyncedUrlMigration<T>({
  syncConfig,
  values,
  onValuesChange,
  getExpression,
  makePlaceholder,
}: {
  syncConfig: SyncConfig | undefined;
  values: T[];
  onValuesChange: (v: T[]) => void;
  getExpression: (item: T) => string;
  makePlaceholder: (url: string) => T;
}) {
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const handleUrlAdded = useCallback(
    (url: string) => {
      onValuesChange([...valuesRef.current, makePlaceholder(url)]);
    },
    [onValuesChange, makePlaceholder]
  );

  const existingUrls = useMemo(
    () =>
      values
        .map(getExpression)
        .filter(isSyncedTag)
        .map(parseSyncedUrl),
    [values, getExpression]
  );

  const isSynced = useCallback(
    (item: T) => isSyncedTag(getExpression(item)),
    [getExpression]
  );

  const getSyncedUrl = useCallback(
    (item: T) => (isSynced(item) ? parseSyncedUrl(getExpression(item)) : ''),
    [getExpression, isSynced]
  );

  return { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl };
}

// Shared helpers

/** Download `data` as a JSON file. */
function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Derive a filename from a label, e.g. "Required Keywords" → "required-keywords-2026-02-08.14-56".json */
function labelToFilename(label: string) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}.${hh}-${min}`;
  return `${label.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.json`;
}

/**
 * Hook that encapsulates the import-modal disclosure, a validated import
 * handler, and a JSON-export handler.
 */
function useImportExport<T>(
  getExportData: () => unknown,
  onImport: (data: any) => boolean,
  label: string
) {
  const modal = useDisclosure(false);

  const handleImport = useCallback(
    (data: any) => {
      if (!onImport(data)) {
        toast.error('Invalid import format');
      }
    },
    [onImport]
  );

  const handleExport = useCallback(() => {
    downloadJson(getExportData(), labelToFilename(label));
  }, [getExportData, label]);

  return { modal, handleImport, handleExport } as const;
}

// Reusable item-list action buttons

interface ItemActionsProps<T> {
  items: T[];
  index: number;
  onItemsChange: (items: T[]) => void;
}

/** Move-up / Move-down / Delete buttons shared by every list item. */
function ItemActions<T>({ items, index, onItemsChange }: ItemActionsProps<T>) {
  return (
    <>
      <IconButton
        size="sm"
        rounded
        icon={<FaArrowUp />}
        intent="primary-subtle"
        disabled={index === 0}
        onClick={() => onItemsChange(arrayMove(items, index, index - 1))}
      />
      <IconButton
        size="sm"
        rounded
        icon={<FaArrowDown />}
        intent="primary-subtle"
        disabled={index === items.length - 1}
        onClick={() => onItemsChange(arrayMove(items, index, index + 1))}
      />
      <IconButton
        size="sm"
        rounded
        icon={<FaRegTrashAlt />}
        intent="alert-subtle"
        onClick={() =>
          onItemsChange([...items.slice(0, index), ...items.slice(index + 1)])
        }
      />
    </>
  );
}

// Reusable list footer (Add + Import/Export)

interface ListFooterProps {
  onAdd: () => void;
  onImportClick: () => void;
  onExport: () => void;
  children?: ReactNode;
}

function ListFooter({
  onAdd,
  onImportClick,
  onExport,
  children,
}: ListFooterProps) {
  return (
    <div className="mt-2 flex gap-2 items-center">
      <IconButton
        rounded
        size="sm"
        intent="primary-subtle"
        icon={<FaPlus />}
        onClick={onAdd}
      />
      {children}
      <div className="ml-auto flex gap-2">
        <Tooltip
          trigger={
            <IconButton
              rounded
              size="sm"
              intent="primary-subtle"
              icon={<FaFileImport />}
              onClick={onImportClick}
            />
          }
        >
          Import
        </Tooltip>
        <Tooltip
          trigger={
            <IconButton
              rounded
              size="sm"
              intent="primary-subtle"
              icon={<FaFileExport />}
              onClick={onExport}
            />
          }
        >
          Export
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Placeholder inline container for synced URLs
 */
function PlaceholderSyncedUrls({
  syncConfig,
  renderType,
  url,
}: {
  syncConfig: SyncConfig;
  renderType: 'simple' | 'nameable' | 'ranked';
  url: string;
}) {
  const singleUrlConfig = useMemo(
    () => ({ ...syncConfig, urls: [url] }),
    [syncConfig, url]
  );

  return (
    <div className="border border-dashed border-[--brand]/40 rounded-md p-3 bg-[--brand]/5 relative mt-4 mb-1">
      <div className="absolute -top-3 left-3 bg-[--background] px-1 text-xs text-[--brand] font-medium">
        Synced URLs
      </div>
      <SyncedUrlInputs
        syncConfig={singleUrlConfig}
        renderType={renderType}
        hideHeader
        hideAddForm
      />
    </div>
  );
}

// Layout helper for filter inputs

interface FilterInputContainerProps {
  title: string;
  description: string;
  children: ReactNode;
  onAdd: () => void;
  importExport: {
    modal: { open: () => void; isOpen: boolean; toggle: () => void };
    handleImport: (data: any) => void;
    handleExport: () => void;
  };
  sync?: {
    syncConfig?: SyncConfig;
    handleUrlAdded: (url: string) => void;
    existingUrls: string[];
    renderType: 'simple' | 'nameable' | 'ranked';
  };
}

function FilterInputContainer({
  title,
  description,
  children,
  onAdd,
  importExport,
  sync,
}: FilterInputContainerProps) {
  return (
    <SettingsCard title={title} description={description}>
      {children}
      <ListFooter
        onAdd={onAdd}
        onImportClick={importExport.modal.open}
        onExport={importExport.handleExport}
      />
      <ImportModal
        open={importExport.modal.isOpen}
        onOpenChange={importExport.modal.toggle}
        onImport={importExport.handleImport}
      />
      {sync?.syncConfig && (
        <SyncedUrlInputs
          syncConfig={sync.syncConfig}
          renderType={sync.renderType}
          hideList
          onUrlAdded={sync.handleUrlAdded}
          existingUrls={sync.existingUrls}
        />
      )}
    </SettingsCard>
  );
}

// TextInputs

// Item components

function TextInputItem({
  value,
  index,
  itemName,
  placeholder,
  disabled,
  syncedUrl,
  syncConfig,
  onValueChange,
  items,
  onItemsChange,
}: {
  value: string;
  index: number;
  itemName: string;
  placeholder?: string;
  disabled?: boolean;
  syncedUrl: string;
  syncConfig?: SyncConfig;
  onValueChange: (val: string, index: number) => void;
  items: string[];
  onItemsChange: (items: string[]) => void;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        {syncedUrl && syncConfig ? (
          <PlaceholderSyncedUrls
            syncConfig={syncConfig}
            renderType="simple"
            url={syncedUrl}
          />
        ) : (
          <TextInput
            value={value}
            label={itemName}
            placeholder={placeholder}
            disabled={disabled}
            onValueChange={(newValue) => onValueChange(newValue, index)}
          />
        )}
      </div>
      <div className="flex gap-1 items-end pb-1">
        <ItemActions
          items={items}
          index={index}
          onItemsChange={onItemsChange}
        />
      </div>
    </div>
  );
}

function ToggleableTextInputItem({
  value,
  index,
  placeholder,
  syncedUrl,
  syncConfig,
  onExpressionChange,
  onEnabledChange,
  items,
  onItemsChange,
}: {
  value: { expression: string; enabled: boolean };
  index: number;
  placeholder?: string;
  syncedUrl: string;
  syncConfig?: SyncConfig;
  onExpressionChange: (val: string, index: number) => void;
  onEnabledChange?: (enabled: boolean, index: number) => void;
  items: { expression: string; enabled: boolean }[];
  onItemsChange: (items: { expression: string; enabled: boolean }[]) => void;
}) {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex items-center pb-0.5">
        <Checkbox
          value={value.enabled ?? true}
          defaultValue={true}
          size="lg"
          onValueChange={(v) => {
            if (onEnabledChange) {
              onEnabledChange(v === true, index);
            }
          }}
        />
      </div>
      <div className="flex-1">
        {syncedUrl && syncConfig ? (
          <PlaceholderSyncedUrls
            syncConfig={syncConfig}
            renderType="nameable"
            url={syncedUrl}
          />
        ) : (
          <TextInput
            value={value.expression}
            label="Expression"
            placeholder={placeholder}
            disabled={value.enabled === false}
            onValueChange={(newValue) => onExpressionChange(newValue, index)}
          />
        )}
      </div>
      <div className="flex gap-1 items-end pb-1">
        <ItemActions
          items={items}
          index={index}
          onItemsChange={onItemsChange}
        />
      </div>
    </div>
  );
}

function KeyValueInputItem({
  value,
  index,
  keyName,
  keyPlaceholder,
  valueName,
  valuePlaceholder,
  disabled,
  syncedUrl,
  syncConfig,
  onKeyChange,
  onValueChange,
  items,
  onItemsChange,
}: {
  value: { name: string; value: string };
  index: number;
  keyName: string;
  keyPlaceholder: string;
  valueName: string;
  valuePlaceholder: string;
  disabled?: boolean;
  syncedUrl: string;
  syncConfig?: SyncConfig;
  onKeyChange: (val: string, index: number) => void;
  onValueChange: (val: string, index: number) => void;
  items: { name: string; value: string }[];
  onItemsChange: (items: { name: string; value: string }[]) => void;
}) {
  return (
    <div className="flex gap-2">
      {!syncedUrl && (
        <div className="flex-1">
          <TextInput
            value={value.name}
            label={keyName}
            placeholder={keyPlaceholder}
            disabled={disabled}
            onValueChange={(val) => onKeyChange(val, index)}
          />
        </div>
      )}
      <div className="flex-1">
        {syncedUrl && syncConfig ? (
          <PlaceholderSyncedUrls
            syncConfig={syncConfig}
            renderType="nameable"
            url={syncedUrl}
          />
        ) : (
          <TextInput
            value={value.value}
            label={valueName}
            placeholder={valuePlaceholder}
            disabled={disabled}
            onValueChange={(newValue) => onValueChange(newValue, index)}
          />
        )}
      </div>
      <div className="flex gap-1 items-end pb-1">
        <ItemActions
          items={items}
          index={index}
          onItemsChange={onItemsChange}
        />
      </div>
    </div>
  );
}

// TextInputs

export type TextInputProps = {
  itemName: string;
  label: string;
  help: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
  placeholder?: string;
  syncConfig?: SyncConfig;
  disabled?: boolean;
};

export function TextInputs({
  itemName,
  label,
  help,
  values,
  onValuesChange,
  placeholder,
  syncConfig,
  disabled,
}: TextInputProps) {
  const getExpression = useCallback((v: string) => v, []);
  const makePlaceholder = useCallback((url: string) => makeSyncedTag(url), []);

  const { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl } =
    useSyncedUrlMigration({
      syncConfig,
      values,
      onValuesChange,
      getExpression,
      makePlaceholder,
    });

  const { modal, handleImport, handleExport } = useImportExport(
    () => ({ values: valuesRef.current }),
    (data: any) => {
      if (Array.isArray(data.values)) {
        onValuesChange(data.values);
        return true;
      }
      return false;
    },
    label
  );

  return (
    <FilterInputContainer
      title={label}
      description={help}
      onAdd={() => onValuesChange([...values, ''])}
      importExport={{ modal, handleImport, handleExport }}
      sync={{ syncConfig, handleUrlAdded, existingUrls, renderType: 'simple' }}
    >
      {values.map((value, index) => (
        <TextInputItem
          key={index}
          value={value}
          index={index}
          itemName={itemName}
          placeholder={placeholder}
          disabled={disabled}
          syncedUrl={getSyncedUrl(value)}
          syncConfig={syncConfig}
          onValueChange={(newValue) => {
            if (checkManualSyncTag(newValue)) return;
            const current = valuesRef.current;
            onValuesChange([
              ...current.slice(0, index),
              newValue,
              ...current.slice(index + 1),
            ]);
          }}
          items={values}
          onItemsChange={onValuesChange}
        />
      ))}
    </FilterInputContainer>
  );
}

// ToggleableTextInputs

export type ToggleableTextInputProps = {
  title: string;
  description: string;
  values: { expression: string; enabled: boolean }[];
  onValuesChange: (values: { expression: string; enabled: boolean }[]) => void;
  onExpressionChange: (expression: string, index: number) => void;
  onEnabledChange?: (enabled: boolean, index: number) => void;
  placeholder?: string;
  syncConfig?: SyncConfig;
};

export function ToggleableTextInputs({
  title,
  description,
  values,
  onValuesChange,
  onExpressionChange,
  onEnabledChange,
  placeholder,
  syncConfig,
}: ToggleableTextInputProps) {
  const getExpression = useCallback((v: { expression: string }) => v.expression, []);
  const makePlaceholder = useCallback(
    (url: string) => ({
      expression: makeSyncedTag(url),
      enabled: true,
    }),
    []
  );

  const { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl } =
    useSyncedUrlMigration({
      syncConfig,
      values,
      onValuesChange,
      getExpression,
      makePlaceholder,
    });

  const { modal, handleImport, handleExport } = useImportExport(
    () =>
      valuesRef.current.map((v) => ({
        expression: v.expression,
        enabled: v.enabled,
      })),
    (data: any) => {
      // Support both new format [{expression, enabled}] and legacy format {values: string[]}
      if (
        Array.isArray(data) &&
        data.every((v: any) => typeof v.expression === 'string')
      ) {
        onValuesChange(
          data.map((v: { expression: string; enabled?: boolean }) => ({
            expression: v.expression,
            enabled: v.enabled ?? true,
          }))
        );
        return true;
      }
      if (Array.isArray(data?.values)) {
        onValuesChange(
          data.values.map((v: string) => ({
            expression: v,
            enabled: true,
          }))
        );
        return true;
      }
      return false;
    },
    title
  );

  return (
    <FilterInputContainer
      title={title}
      description={description}
      onAdd={() =>
        onValuesChange([...values, { expression: '', enabled: true }])
      }
      importExport={{ modal, handleImport, handleExport }}
      sync={{ syncConfig, handleUrlAdded, existingUrls, renderType: 'nameable' }}
    >
      {values.map((value, index) => (
        <ToggleableTextInputItem
          key={index}
          value={value}
          index={index}
          placeholder={placeholder}
          syncedUrl={getSyncedUrl(value)}
          syncConfig={syncConfig}
          onExpressionChange={(newValue, idx) => {
            if (checkManualSyncTag(newValue)) return;
            onExpressionChange(newValue, idx);
          }}
          onEnabledChange={onEnabledChange}
          items={values}
          onItemsChange={onValuesChange}
        />
      ))}
    </FilterInputContainer>
  );
}

// TwoTextInputs (KeyValueInput)

export type KeyValueInputProps = {
  title: string;
  description: string;
  keyId: string;
  keyName: string;
  keyPlaceholder: string;
  valueId: string;
  valueName: string;
  valuePlaceholder: string;
  values: { name: string; value: string }[];
  onValuesChange: (values: { name: string; value: string }[]) => void;
  onValueChange: (value: string, index: number) => void;
  onKeyChange: (key: string, index: number) => void;
  disabled?: boolean;
  syncConfig?: SyncConfig;
};

export function TwoTextInputs({
  title,
  description,
  keyName,
  keyId,
  keyPlaceholder,
  valueId,
  valueName,
  valuePlaceholder,
  values,
  onValuesChange,
  onValueChange,
  onKeyChange,
  disabled,
  syncConfig,
}: KeyValueInputProps) {
  const getExpression = useCallback((v: { name: string }) => v.name, []);
  const makePlaceholder = useCallback(
    (url: string) => ({
      name: makeSyncedTag(url),
      value: makeSyncedTag(url),
    }),
    []
  );

  const { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl } =
    useSyncedUrlMigration({
      syncConfig,
      values,
      onValuesChange,
      getExpression,
      makePlaceholder,
    });

  const { modal, handleImport, handleExport } = useImportExport(
    () =>
      valuesRef.current.map((v) => ({ [keyId]: v.name, [valueId]: v.value })),
    (data: any) => {
      if (
        Array.isArray(data) &&
        data.every(
          (v: Record<string, string>) =>
            typeof v[keyId] === 'string' && typeof v[valueId] === 'string'
        )
      ) {
        onValuesChange(
          data.map((v: Record<string, string>) => ({
            name: v[keyId],
            value: v[valueId],
          }))
        );
        return true;
      }
      return false;
    },
    title
  );

  return (
    <FilterInputContainer
      title={title}
      description={description}
      onAdd={() => onValuesChange([...values, { name: '', value: '' }])}
      importExport={{ modal, handleImport, handleExport }}
      sync={{ syncConfig, handleUrlAdded, existingUrls, renderType: 'nameable' }}
    >
      {values.map((value, index) => (
        <KeyValueInputItem
          key={index}
          value={value}
          index={index}
          keyName={keyName}
          keyPlaceholder={keyPlaceholder}
          valueName={valueName}
          valuePlaceholder={valuePlaceholder}
          disabled={disabled}
          syncedUrl={getSyncedUrl(value)}
          syncConfig={syncConfig}
          onKeyChange={(val, idx) => {
            if (checkManualSyncTag(val)) return;
            onKeyChange(val, idx);
          }}
          onValueChange={(val, idx) => {
            if (checkManualSyncTag(val)) return;
            onValueChange(val, idx);
          }}
          items={values}
          onItemsChange={onValuesChange}
        />
      ))}
    </FilterInputContainer>
  );
}

function RankedExpressionItem({
  value,
  index,
  syncedUrl,
  syncConfig,
  onExpressionChange,
  onScoreChange,
  onEnabledChange,
  items,
  onItemsChange,
}: {
  value: { expression: string; score: number; enabled: boolean };
  index: number;
  syncedUrl: string;
  syncConfig?: SyncConfig;
  onExpressionChange: (val: string, index: number) => void;
  onScoreChange: (score: number, index: number) => void;
  onEnabledChange?: (enabled: boolean, index: number) => void;
  items: { expression: string; score: number; enabled: boolean }[];
  onItemsChange: (
    items: { expression: string; score: number; enabled: boolean }[]
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 border rounded-lg bg-[--background-secondary]/30">
      <div className="flex gap-2 items-center">
        <div className="flex items-center pb-0.5">
          <Checkbox
            value={value.enabled ?? true}
            defaultValue={true}
            size="lg"
            onValueChange={(v) => {
              if (onEnabledChange) {
                onEnabledChange(v === true, index);
              }
            }}
          />
        </div>
        <div className={syncedUrl ? 'flex-1' : 'flex-[3]'}>
          {syncedUrl && syncConfig ? (
            <PlaceholderSyncedUrls
              syncConfig={syncConfig}
              renderType="ranked"
              url={syncedUrl}
            />
          ) : (
            <TextInput
              value={value.expression}
              label="Expression"
              placeholder="addon(type(streams, 'debrid'), 'TorBox')"
              disabled={value.enabled === false}
              onValueChange={(newValue) => onExpressionChange(newValue, index)}
            />
          )}
        </div>
        {!syncedUrl && (
          <div className="flex-1">
            <NumberInput
              value={value.score}
              defaultValue={0}
              label="Score"
              disabled={value.enabled === false}
              onValueChange={(newValue) => onScoreChange(newValue || 0, index)}
              min={-1_000_000}
              max={1_000_000}
              step={50}
            />
          </div>
        )}
      </div>
      <div className="flex justify-end items-center mt-1">
        <div className="flex gap-1 pb-1">
          <ItemActions
            items={items}
            index={index}
            onItemsChange={onItemsChange}
          />
        </div>
      </div>
    </div>
  );
}

function RankedRegexItem({
  value,
  index,
  syncedUrl,
  syncConfig,
  onPatternChange,
  onNameChange,
  onScoreChange,
  items,
  onItemsChange,
}: {
  value: { pattern: string; name?: string; score: number };
  index: number;
  syncedUrl: string;
  syncConfig?: SyncConfig;
  onPatternChange: (val: string, index: number) => void;
  onNameChange: (val: string, index: number) => void;
  onScoreChange: (score: number, index: number) => void;
  items: { pattern: string; name?: string; score: number }[];
  onItemsChange: (
    items: { pattern: string; name?: string; score: number }[]
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 border rounded-lg bg-[--background-secondary]/30">
      <div className="flex gap-2 w-full">
        {syncedUrl && syncConfig ? (
          <div className="flex-1">
            <PlaceholderSyncedUrls
              syncConfig={syncConfig}
              renderType="ranked"
              url={syncedUrl}
            />
          </div>
        ) : (
          <>
            <div className="flex-1">
              <TextInput
                value={value.pattern}
                label="Regex Pattern"
                placeholder="e.g. ^\[.*\]"
                onValueChange={(newValue) => onPatternChange(newValue, index)}
              />
            </div>
            <div className="flex-1">
              <TextInput
                value={value.name || ''}
                label="Visual Name"
                placeholder="e.g. Release Group"
                onValueChange={(newValue) => onNameChange(newValue, index)}
              />
            </div>
          </>
        )}
        {!syncedUrl && (
          <div className="flex-1">
            <NumberInput
              value={value.score}
              defaultValue={0}
              label="Score"
              onValueChange={(newValue) => onScoreChange(newValue || 0, index)}
              min={-1_000_000}
              max={1_000_000}
              step={50}
            />
          </div>
        )}
      </div>
      <div className="flex justify-end items-center mt-1">
        <div className="flex gap-1 pb-1">
          <ItemActions
            items={items}
            index={index}
            onItemsChange={onItemsChange}
          />
        </div>
      </div>
    </div>
  );
}


// RankedExpressionInputs

export type RankedExpressionInputProps = {
  title: string;
  description: string;
  values: { expression: string; score: number; enabled: boolean }[];
  onValuesChange: (
    values: { expression: string; score: number; enabled: boolean }[]
  ) => void;
  onExpressionChange: (expression: string, index: number) => void;
  onScoreChange: (score: number, index: number) => void;
  onEnabledChange?: (enabled: boolean, index: number) => void;
  syncConfig?: SyncConfig;
};

export function RankedExpressionInputs({
  title,
  description,
  values,
  onValuesChange,
  onExpressionChange,
  onScoreChange,
  onEnabledChange,
  syncConfig,
}: RankedExpressionInputProps) {
  const getExpression = useCallback((v: { expression: string }) => v.expression, []);
  const makePlaceholder = useCallback(
    (url: string) => ({
      expression: makeSyncedTag(url),
      score: 0,
      enabled: true,
    }),
    []
  );

  const { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl } =
    useSyncedUrlMigration({
      syncConfig,
      values,
      onValuesChange,
      getExpression,
      makePlaceholder,
    });

  const { modal, handleImport, handleExport } = useImportExport(
    () =>
      valuesRef.current.map((v) => ({
        expression: v.expression,
        score: v.score,
        enabled: v.enabled,
      })),
    (data: any) => {
      if (
        Array.isArray(data) &&
        data.every(
          (v: { expression?: string; score?: number }) =>
            typeof v.expression === 'string' && typeof v.score === 'number'
        )
      ) {
        onValuesChange(
          data.map(
            (v: { expression: string; score: number; enabled?: boolean }) => ({
              expression: v.expression,
              score: v.score,
              enabled: v.enabled ?? true,
            })
          )
        );
        return true;
      }
      return false;
    },
    title
  );

  return (
    <FilterInputContainer
      title={title}
      description={description}
      onAdd={() =>
        onValuesChange([...values, { expression: '', score: 0, enabled: true }])
      }
      importExport={{ modal, handleImport, handleExport }}
      sync={{ syncConfig, handleUrlAdded, existingUrls, renderType: 'ranked' }}
    >
      <div className="flex flex-col gap-3">
        {values.map((value, index) => (
          <RankedExpressionItem
            key={index}
            value={value}
            index={index}
            syncedUrl={getSyncedUrl(value)}
            syncConfig={syncConfig}
            onExpressionChange={(newValue, idx) => {
              if (checkManualSyncTag(newValue)) return;
              onExpressionChange(newValue, idx);
            }}
            onScoreChange={onScoreChange}
            onEnabledChange={onEnabledChange}
            items={values}
            onItemsChange={onValuesChange}
          />
        ))}
      </div>
    </FilterInputContainer>
  );
}

// RankedRegexInputs

export interface RankedRegexInputProps {
  title: string;
  description: string;
  values: NonNullable<UserData['rankedRegexPatterns']>;
  onValuesChange: (
    values: NonNullable<UserData['rankedRegexPatterns']>
  ) => void;
  onPatternChange: (pattern: string, index: number) => void;
  onNameChange: (name: string, index: number) => void;
  onScoreChange: (score: number, index: number) => void;
  syncConfig?: SyncConfig;
}

export function RankedRegexInputs({
  title,
  description,
  values,
  onValuesChange,
  onPatternChange,
  onNameChange,
  onScoreChange,
  syncConfig,
}: RankedRegexInputProps) {
  const getExpression = useCallback((v: { pattern: string }) => v.pattern, []);
  const makePlaceholder = useCallback(
    (url: string) => ({
      pattern: makeSyncedTag(url),
      name: url,
      score: 0,
    }),
    []
  );

  const { valuesRef, handleUrlAdded, existingUrls, isSynced, getSyncedUrl } =
    useSyncedUrlMigration({
      syncConfig,
      values,
      onValuesChange,
      getExpression,
      makePlaceholder,
    });

  const { modal, handleImport, handleExport } = useImportExport(
    () =>
      valuesRef.current.map((v) => ({
        pattern: v.pattern,
        name: v.name,
        score: v.score,
      })),
    (data: any) => {
      if (
        Array.isArray(data) &&
        data.every(
          (v: { pattern?: string; score?: number }) =>
            typeof v.pattern === 'string' && typeof v.score === 'number'
        )
      ) {
        onValuesChange(
          data.map((v: { pattern: string; name?: string; score: number }) => ({
            pattern: v.pattern,
            name: v.name || v.pattern,
            score: v.score,
          }))
        );
        return true;
      }
      return false;
    },
    title
  );

  return (
    <FilterInputContainer
      title={title}
      description={description}
      onAdd={() => onValuesChange([...values, { pattern: '', name: '', score: 0 }])}
      importExport={{ modal, handleImport, handleExport }}
      sync={{ syncConfig, handleUrlAdded, existingUrls, renderType: 'ranked' }}
    >
      <div className="flex flex-col gap-3">
        {values.map((value, index) => (
          <RankedRegexItem
            key={index}
            value={value}
            index={index}
            syncedUrl={getSyncedUrl(value)}
            syncConfig={syncConfig}
            onPatternChange={(newValue, idx) => {
              if (checkManualSyncTag(newValue)) return;
              onPatternChange(newValue, idx);
            }}
            onNameChange={(newValue, idx) => {
              if (checkManualSyncTag(newValue)) return;
              onNameChange(newValue, idx);
            }}
            onScoreChange={onScoreChange}
            items={values}
            onItemsChange={onValuesChange}
          />
        ))}
      </div>
    </FilterInputContainer>
  );
}
