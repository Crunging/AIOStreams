'use client';
import { ReactNode, useCallback, useRef, useEffect, useMemo } from 'react';
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
} from '../../../../../../core/src/utils/synced-helpers';
import {
  FaPlus,
  FaRegTrashAlt,
  FaFileExport,
  FaFileImport,
  FaArrowUp,
  FaArrowDown,
} from 'react-icons/fa';
import { UserData } from '@aiostreams/core';

function checkManualSyncTag(value: string): boolean {
  if (isManualSyncTagAttempt(value)) {
    toast.warning('Manual entry of synchronized tags is not allowed.');
    return true;
  }
  return false;
}

/**
 * Custom hook to handle auto-migration of legacy `urls` array to the new inline tags
 * and manage the `handleAdd` callback.
 */
function useSyncedUrlMigration<T>(
  syncConfig: SyncConfig | undefined,
  values: T[],
  valuesRef: React.MutableRefObject<T[]>,
  onValuesChange: (v: T[]) => void,
  getExpression: (item: T) => string,
  makePlaceholder: (url: string) => T
) {
  const hasAutoAppended = useRef(false);

  useEffect(() => {
    if (!syncConfig?.urls?.length || hasAutoAppended.current) return;
    hasAutoAppended.current = true;

    const current = valuesRef.current;
    const toAdd = syncConfig.urls.filter(
      (url: string) => !current.some((v) => getExpression(v) === makeSyncedTag(url))
    );

    if (toAdd.length) {
      onValuesChange([...current, ...toAdd.map(makePlaceholder)]);
    }
    // Clear legacy array after migration
    syncConfig.onUrlsChange([]);
  }, [syncConfig, onValuesChange, getExpression, makePlaceholder, valuesRef]);

  const handleUrlAdded = useCallback(
    (url: string) => {
      onValuesChange([...valuesRef.current, makePlaceholder(url)]);
    },
    [onValuesChange, makePlaceholder, valuesRef]
  );

  const existingUrls = useMemo(
    () =>
      values
        .map(getExpression)
        .filter(isSyncedTag)
        .map(parseSyncedUrl),
    [values, getExpression]
  );

  return { handleUrlAdded, existingUrls };
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

// Placeholder inline container for synced URLs
function PlaceholderSyncedUrls({
  syncConfig,
  renderType,
  url,
}: {
  syncConfig: SyncConfig;
  renderType: 'simple' | 'nameable' | 'ranked';
  url: string;
}) {
  return (
    <div className="border border-dashed border-[--brand]/40 rounded-md p-3 bg-[--brand]/5 relative mt-4 mb-1">
      <div className="absolute -top-3 left-3 bg-[--background] px-1 text-xs text-[--brand] font-medium">
        Synced URLs
      </div>
      <SyncedUrlInputs
        syncConfig={{ ...syncConfig, urls: [url] }}
        renderType={renderType}
        hideHeader
        hideAddForm
      />
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
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const getExportData = useCallback(() => ({ values: valuesRef.current }), []);
  const handleImportData = useCallback(
    (data: any) => {
      if (Array.isArray(data.values)) {
        onValuesChange(data.values);
        return true;
      }
      return false;
    },
    [onValuesChange]
  );
  const { modal, handleImport, handleExport } = useImportExport(
    getExportData,
    handleImportData,
    label
  );

  const handleValueChange = useCallback(
    (newValue: string, index: number) => {
      const current = valuesRef.current;
      onValuesChange([
        ...current.slice(0, index),
        newValue,
        ...current.slice(index + 1),
      ]);
    },
    [onValuesChange]
  );

  const getExpression = useCallback((v: string) => v, []);
  const makePlaceholder = useCallback(
    (url: string) => makeSyncedTag(url),
    []
  );

  const { handleUrlAdded, existingUrls } = useSyncedUrlMigration(
    syncConfig,
    values,
    valuesRef,
    onValuesChange,
    getExpression,
    makePlaceholder
  );

  return (
    <SettingsCard title={label} description={help} key={label}>
      {values.map((value, index) => {
        const isSyncedPlaceholder = isSyncedTag(value);
        const syncedUrl = isSyncedPlaceholder ? parseSyncedUrl(value) : '';

        return (
          <div key={index} className="flex gap-2">
            <div className="flex-1">
              {isSyncedPlaceholder && syncConfig ? (
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
                  onValueChange={(newValue) => {
                    if (checkManualSyncTag(newValue)) return;
                    handleValueChange(newValue, index);
                  }}
                />
              )}
            </div>
            <div className="flex gap-1 items-end pb-1">
              <ItemActions
                items={values}
                index={index}
                onItemsChange={onValuesChange}
              />
            </div>
          </div>
        );
      })}
      <ListFooter
        onAdd={() => onValuesChange([...values, ''])}
        onImportClick={modal.open}
        onExport={handleExport}
      />
      <ImportModal
        open={modal.isOpen}
        onOpenChange={modal.toggle}
        onImport={handleImport}
      />
      {syncConfig && (
        <SyncedUrlInputs
          syncConfig={syncConfig}
          renderType="simple"
          hideList
          onUrlAdded={handleUrlAdded}
          existingUrls={existingUrls}
        />
      )}
    </SettingsCard>
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
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const getExportData = useCallback(
    () =>
      valuesRef.current.map((v) => ({
        expression: v.expression,
        enabled: v.enabled,
      })),
    []
  );
  const handleImportData = useCallback(
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
    [onValuesChange]
  );
  const { modal, handleImport, handleExport } = useImportExport(
    getExportData,
    handleImportData,
    title
  );

  const getExpression = useCallback((v: { expression: string }) => v.expression, []);
  const makePlaceholder = useCallback(
    (url: string) => ({ expression: makeSyncedTag(url), enabled: true }),
    []
  );

  const { handleUrlAdded, existingUrls } = useSyncedUrlMigration(
    syncConfig,
    values,
    valuesRef,
    onValuesChange,
    getExpression,
    makePlaceholder
  );

  return (
    <SettingsCard title={title} description={description}>
      {values.map((value, index) => {
        const isSyncedPlaceholder = isSyncedTag(value.expression);
        const syncedUrl = isSyncedPlaceholder
          ? parseSyncedUrl(value.expression)
          : '';

        return (
          <div key={index} className="flex gap-2 items-end">
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
              {isSyncedPlaceholder && syncConfig ? (
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
                  onValueChange={(newValue) => {
                    if (checkManualSyncTag(newValue)) return;
                    onExpressionChange(newValue, index);
                  }}
                />
              )}
            </div>
            <div className="flex gap-1 items-end pb-1">
              <ItemActions
                items={values}
                index={index}
                onItemsChange={onValuesChange}
              />
            </div>
          </div>
        );
      })}
      <ListFooter
        onAdd={() =>
          onValuesChange([...values, { expression: '', enabled: true }])
        }
        onImportClick={modal.open}
        onExport={handleExport}
      />
      <ImportModal
        open={modal.isOpen}
        onOpenChange={modal.toggle}
        onImport={handleImport}
      />
      {syncConfig && (
        <SyncedUrlInputs
          syncConfig={syncConfig}
          renderType="nameable"
          hideList
          onUrlAdded={handleUrlAdded}
          existingUrls={existingUrls}
        />
      )}
    </SettingsCard>
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
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const getExportData = useCallback(
    () =>
      valuesRef.current.map((v) => ({ [keyId]: v.name, [valueId]: v.value })),
    [keyId, valueId]
  );
  const handleImportData = useCallback(
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
    [onValuesChange, keyId, valueId]
  );
  const { modal, handleImport, handleExport } = useImportExport(
    getExportData,
    handleImportData,
    title
  );

  const getExpression = useCallback((v: { name: string }) => v.name, []);
  const makePlaceholder = useCallback(
    (url: string) => ({ name: makeSyncedTag(url), value: makeSyncedTag(url) }),
    []
  );

  const { handleUrlAdded, existingUrls } = useSyncedUrlMigration(
    syncConfig,
    values,
    valuesRef,
    onValuesChange,
    getExpression,
    makePlaceholder
  );

  return (
    <SettingsCard title={title} description={description}>
      {values.map((value, index) => {
        const isSyncedPlaceholder = isSyncedTag(value.name);
        const syncedUrl = isSyncedPlaceholder ? parseSyncedUrl(value.name) : '';

        return (
          <div key={index} className="flex gap-2">
            {!isSyncedPlaceholder && (
              <div className="flex-1">
                <TextInput
                  value={value.name}
                  label={keyName}
                  placeholder={keyPlaceholder}
                  onValueChange={(val) => {
                    if (checkManualSyncTag(val)) return;
                    onKeyChange(val, index);
                  }}
                />
              </div>
            )}
            <div className="flex-1">
              {isSyncedPlaceholder && syncConfig ? (
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
                  onValueChange={(newValue) => {
                    if (checkManualSyncTag(newValue)) return;
                    onValueChange(newValue, index);
                  }}
                />
              )}
            </div>
            <div className="flex gap-1 items-end pb-1">
              <ItemActions
                items={values}
                index={index}
                onItemsChange={onValuesChange}
              />
            </div>
          </div>
        );
      })}
      <ListFooter
        onAdd={() => onValuesChange([...values, { name: '', value: '' }])}
        onImportClick={modal.open}
        onExport={handleExport}
      />
      <ImportModal
        open={modal.isOpen}
        onOpenChange={modal.toggle}
        onImport={handleImport}
      />
      {syncConfig && (
        <SyncedUrlInputs
          syncConfig={syncConfig}
          renderType="nameable"
          hideList
          onUrlAdded={handleUrlAdded}
          existingUrls={existingUrls}
        />
      )}
    </SettingsCard>
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
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const getExportData = useCallback(
    () =>
      valuesRef.current.map((v) => ({
        expression: v.expression,
        score: v.score,
        enabled: v.enabled,
      })),
    []
  );
  const handleImportData = useCallback(
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
    [onValuesChange]
  );
  const { modal, handleImport, handleExport } = useImportExport(
    getExportData,
    handleImportData,
    title
  );

  const getExpression = useCallback((v: { expression: string }) => v.expression, []);
  const makePlaceholder = useCallback(
    (url: string) => ({ expression: makeSyncedTag(url), score: 0, enabled: true }),
    []
  );

  const { handleUrlAdded, existingUrls } = useSyncedUrlMigration(
    syncConfig,
    values,
    valuesRef,
    onValuesChange,
    getExpression,
    makePlaceholder
  );

  return (
    <SettingsCard title={title} description={description}>
      {values.map((value, index) => {
        const isSyncedPlaceholder = isSyncedTag(value.expression);
        const syncedUrl = isSyncedPlaceholder ? parseSyncedUrl(value.expression) : '';

        return (
          <div key={index} className="flex gap-2 items-end">
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
            <div className={isSyncedPlaceholder ? "flex-1" : "flex-[3]"}>
              {isSyncedPlaceholder && syncConfig ? (
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
                  onValueChange={(newValue) => {
                    if (checkManualSyncTag(newValue)) return;
                    onExpressionChange(newValue, index);
                  }}
                />
              )}
            </div>
            {!isSyncedPlaceholder && (
              <div className="flex-1 min-w-[100px]">
                <NumberInput
                  value={value.score || 0}
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
            <div className="pb-1 gap-1 flex items-end">
              <ItemActions
                items={values}
                index={index}
                onItemsChange={onValuesChange}
              />
            </div>
          </div>
        );
      })}
      <ListFooter
        onAdd={() =>
          onValuesChange([
            ...values,
            { expression: '', score: 0, enabled: true },
          ])
        }
        onImportClick={modal.open}
        onExport={handleExport}
      />
      <ImportModal
        open={modal.isOpen}
        onOpenChange={modal.toggle}
        onImport={handleImport}
      />
      {syncConfig && (
        <SyncedUrlInputs
          syncConfig={syncConfig}
          renderType="ranked"
          hideList
          onUrlAdded={handleUrlAdded}
          existingUrls={existingUrls}
        />
      )}
    </SettingsCard>
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
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const getExportData = useCallback(
    () =>
      valuesRef.current.map((v) => ({
        pattern: v.pattern,
        name: v.name,
        score: v.score,
      })),
    []
  );
  const handleImportData = useCallback(
    (data: any) => {
      if (
        Array.isArray(data) &&
        data.every(
          (v: any) =>
            typeof v.pattern === 'string' && typeof v.score === 'number'
        )
      ) {
        onValuesChange(
          data.map((v: any) => ({
            pattern: v.pattern,
            name: v.name,
            score: v.score,
          }))
        );
        return true;
      }
      return false;
    },
    [onValuesChange]
  );
  const { modal, handleImport, handleExport } = useImportExport(
    getExportData,
    handleImportData,
    title
  );

  const getExpression = useCallback((v: { pattern: string }) => v.pattern, []);
  const makePlaceholder = useCallback(
    (url: string) => ({ pattern: makeSyncedTag(url), name: url, score: 0 }),
    []
  );

  const { handleUrlAdded, existingUrls } = useSyncedUrlMigration(
    syncConfig,
    values,
    valuesRef,
    onValuesChange,
    getExpression,
    makePlaceholder
  );

  return (
    <SettingsCard title={title} description={description}>
      {values.map((value, index) => {
        const isSyncedPlaceholder = isSyncedTag(value.pattern);
        const syncedUrl = isSyncedPlaceholder ? parseSyncedUrl(value.pattern) : '';

        return (
          <div
            key={index}
            className="flex flex-col gap-2 p-3 border rounded-md border-[--border]"
          >
            <div className="w-full">
              {isSyncedPlaceholder && syncConfig ? (
                <PlaceholderSyncedUrls
                  syncConfig={syncConfig}
                  renderType="ranked"
                  url={syncedUrl}
                />
              ) : (
                <TextInput
                  value={value.pattern}
                  label="Pattern"
                  placeholder="Regex Pattern"
                  onValueChange={(newValue) => {
                    if (checkManualSyncTag(newValue)) return;
                    onPatternChange(newValue, index);
                  }}
                />
              )}
            </div>
            <div className="flex gap-2 items-end">
              {!isSyncedPlaceholder && (
                <>
                  <div className="flex-1">
                    <TextInput
                      value={value.name || ''}
                      label="Name"
                      placeholder="Name (Optional)"
                      onValueChange={(newValue) => onNameChange(newValue, index)}
                    />
                  </div>
                  <div className="w-[20%] min-w-[100px]">
                    <NumberInput
                      value={value.score}
                      label="Score"
                      onValueChange={(newValue) =>
                        onScoreChange(newValue ?? 0, index)
                      }
                      min={-1_000_000}
                      max={1_000_000}
                      step={50}
                    />
                  </div>
                </>
              )}
              <div className={`flex gap-1 pb-1${isSyncedPlaceholder ? ' ml-auto' : ''}`}>
                <ItemActions
                  items={values}
                  index={index}
                  onItemsChange={onValuesChange}
                />
              </div>
            </div>
          </div>
        );
      })}
      <ListFooter
        onAdd={() =>
          onValuesChange([...values, { pattern: '', name: '', score: 0 }])
        }
        onImportClick={modal.open}
        onExport={handleExport}
      />
      <ImportModal
        open={modal.isOpen}
        onOpenChange={modal.toggle}
        onImport={handleImport}
      />
      {syncConfig && (
        <SyncedUrlInputs
          syncConfig={syncConfig}
          renderType="ranked"
          hideList
          onUrlAdded={handleUrlAdded}
          existingUrls={existingUrls}
        />
      )}
    </SettingsCard>
  );
}
