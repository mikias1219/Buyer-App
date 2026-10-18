import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Download, FileUp, ListChecks, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ListGroup, ListRow, Money, Notice, PageHeader, Section, Textarea, toast } from '../../components/ui';
import { rpc } from '../../lib/api/client';
import type { ImportResult } from '../../lib/api/types';
import { downloadText } from '../../lib/csv';
import { formatNumber } from '../../lib/format';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { invalidateStock } from '../products/api';
import { importTemplate, parseImport, type ParsedImport } from './logic';

export default function ImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: (dryRun: boolean) => rpc('import_products', { p_rows: parsed?.rows ?? [], p_dry_run: dryRun }),
    onSuccess: (result, dryRun) => {
      setCheck(result);
      if (!dryRun && result.saved) {
        invalidateStock(qc);
        toast.success(t('import.done', { count: result.valid }));
        navigate('/products', { replace: true });
      }
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const load = (content: string) => {
    setText(content);
    setCheck(null);
    setParsed(content.trim() ? parseImport(content) : null);
  };

  const localOk = parsed !== null && parsed.missingColumns.length === 0 && parsed.errors.length === 0 && parsed.rows.length > 0;
  const tooMany = (parsed?.rows.length ?? 0) > 1000;
  const serverOk = check !== null && check.errors.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />

      <Section title={t('import.step1')}>
        <Card className="space-y-3">
          <p className="text-sm text-hint">{t('import.templateBody')}</p>
          <p className="tabular break-all rounded-input bg-surface-2 p-2 text-xs">name, category, sku, barcode, unit, sell_price, cost_price, opening_stock, reorder_level</p>
          <Button variant="secondary" icon={Download} onClick={() => downloadText('products_template.csv', importTemplate())}>
            {t('import.downloadTemplate')}
          </Button>
        </Card>
      </Section>

      <Section title={t('import.step2')}>
        <Card className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) load(await f.text());
              e.target.value = '';
            }}
          />
          <Button icon={FileUp} onClick={() => fileInput.current?.click()}>
            {t('import.chooseFile')}
          </Button>
          <Textarea label={t('import.orPaste')} rows={5} value={text} placeholder="name,sell_price,opening_stock&#10;Rice,120,50" onChange={(e) => load(e.target.value)} />
        </Card>
      </Section>

      {parsed ? (
        <Section title={t('import.step3')}>
          {parsed.missingColumns.length ? (
            <Notice tone="danger" icon={AlertTriangle} title={t('import.missingColumns')}>
              {parsed.missingColumns.join(', ')}
            </Notice>
          ) : (
            <>
              <Notice tone={localOk && !tooMany ? 'success' : 'warning'} icon={localOk ? CheckCircle2 : AlertTriangle}>
                {tooMany ? t('import.tooMany') : t('import.found', { count: parsed.rows.length, errors: parsed.errors.length })}
              </Notice>
              {parsed.errors.length ? (
                <ListGroup>
                  {parsed.errors.slice(0, 30).map((e, i) => (
                    <ListRow key={i} title={t('import.rowError', { row: e.row })} subtitle={t('import.badValue', { field: t(`import.field.${e.field}`), value: e.value || '—' })} />
                  ))}
                </ListGroup>
              ) : (
                <ListGroup>
                  {parsed.rows.slice(0, 8).map((r, i) => (
                    <ListRow
                      key={i}
                      title={r.name}
                      subtitle={[r.category, r.unit ? t(`unit.${r.unit}`) : null, r.opening_stock !== undefined ? t('import.stockN', { qty: formatNumber(r.opening_stock) }) : null].filter(Boolean).join(' · ')}
                      trailing={<Money value={r.sell_price} />}
                    />
                  ))}
                  {parsed.rows.length > 8 ? <ListRow title={t('import.andMore', { count: parsed.rows.length - 8 })} /> : null}
                </ListGroup>
              )}
            </>
          )}

          {check && check.errors.length > 0 ? (
            <>
              <Notice tone="danger" icon={AlertTriangle} title={t('import.serverErrors', { count: check.errors.length })}>
                {t('import.nothingSaved')}
              </Notice>
              <ListGroup>
                {check.errors.slice(0, 30).map((e, i) => (
                  <ListRow key={i} title={t('import.rowError', { row: e.row })} subtitle={`${t(`errors.${e.code}`, { defaultValue: t('errors.invalid_input') })}${e.detail ? ` (${e.detail})` : ''}`} />
                ))}
              </ListGroup>
            </>
          ) : null}
          {serverOk ? (
            <Notice tone="success" icon={ListChecks}>
              {t('import.checked', { count: check.valid, categories: check.new_categories })}
            </Notice>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={ListChecks} disabled={!localOk || tooMany} loading={run.isPending && run.variables} onClick={() => run.mutate(true)}>
              {t('import.check')}
            </Button>
            <Button icon={Upload} disabled={!serverOk} loading={run.isPending && !run.variables} onClick={() => run.mutate(false)}>
              {t('import.importN', { count: check?.valid ?? 0 })}
            </Button>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
