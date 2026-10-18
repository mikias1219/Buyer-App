import { Boxes, FileSpreadsheet, Receipt, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Notice, PageHeader, PeriodPicker, Section, toast } from '../../components/ui';
import { rpc } from '../../lib/api/client';
import type { Expense, Product } from '../../lib/api/types';
import { downloadText, toCsv } from '../../lib/csv';
import type { Period } from '../../lib/period';
import { resolvePeriod } from '../../lib/period';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useShopSettings } from '../auth/hooks';

type ReportKey = 'sales' | 'products' | 'stock' | 'expenses';

export default function ReportsPage() {
  const { t } = useTranslation();
  const settings = useShopSettings();
  const tz = settings?.timezone ?? 'Africa/Addis_Ababa';
  const [period, setPeriod] = useState<Period>({ preset: 'this_month' });
  const [busy, setBusy] = useState<ReportKey | null>(null);
  const errorMessage = useErrorMessage();
  const range = resolvePeriod(period, tz);
  const suffix = `${range.from}_${range.to}`;

  const run = async (key: ReportKey) => {
    setBusy(key);
    try {
      const { name, csv, rows } = await build(key);
      if (rows === 0) toast.info(t('reports.emptyExport'));
      else {
        downloadText(name, csv);
        toast.success(t('reports.downloaded', { count: rows }));
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const build = async (key: ReportKey): Promise<{ name: string; csv: string; rows: number }> => {
    if (key === 'sales') {
      const lines = await rpc('export_sales_lines', { p_filters: range });
      return {
        name: `sales_${suffix}.csv`,
        rows: lines.length,
        csv: toCsv(lines, [
          { header: t('reports.col.date'), value: (r) => r.date },
          { header: t('reports.col.type'), value: (r) => t(`reports.kind.${r.kind}`) },
          { header: t('reports.col.receipt'), value: (r) => r.receipt_no },
          { header: t('reports.col.product'), value: (r) => r.product },
          { header: t('reports.col.category'), value: (r) => r.category ?? '' },
          { header: t('reports.col.qty'), value: (r) => r.qty },
          { header: t('reports.col.revenue'), value: (r) => r.revenue },
          { header: t('reports.col.cost'), value: (r) => r.cost },
          { header: t('reports.col.profit'), value: (r) => r.profit },
          { header: t('reports.col.payment'), value: (r) => t(`paymentMethod.${r.payment_method}`) },
          { header: t('reports.col.cashier'), value: (r) => r.cashier },
        ]),
      };
    }
    if (key === 'products') {
      const perf = await rpc('product_performance', { p_filters: range, p_sort: 'revenue', p_limit: 500 });
      return {
        name: `product_performance_${suffix}.csv`,
        rows: perf.length,
        csv: toCsv(perf, [
          { header: t('reports.col.product'), value: (r) => r.name },
          { header: t('reports.col.category'), value: (r) => r.category_name ?? '' },
          { header: t('reports.col.qty'), value: (r) => r.qty },
          { header: t('reports.col.unit'), value: (r) => t(`unit.${r.unit}`) },
          { header: t('reports.col.revenue'), value: (r) => r.revenue },
          { header: t('reports.col.cost'), value: (r) => r.cost },
          { header: t('reports.col.profit'), value: (r) => r.profit },
          { header: t('reports.col.margin'), value: (r) => r.margin_pct ?? '' },
          { header: t('reports.col.sales'), value: (r) => r.sales },
          { header: t('reports.col.stockNow'), value: (r) => r.stock_qty },
        ]),
      };
    }
    if (key === 'stock') {
      const all: Product[] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await rpc('list_products', { p_filters: { status: 'active', sort: 'name' }, p_limit: 200, p_offset: offset });
        all.push(...page.items);
        if (all.length >= page.total || page.items.length === 0) break;
      }
      return {
        name: `stock_${range.to}.csv`,
        rows: all.length,
        csv: toCsv(all, [
          { header: t('reports.col.product'), value: (r) => r.name },
          { header: t('reports.col.category'), value: (r) => r.category_name ?? '' },
          { header: 'SKU', value: (r) => r.sku ?? '' },
          { header: t('reports.col.stockNow'), value: (r) => r.stock_qty },
          { header: t('reports.col.unit'), value: (r) => t(`unit.${r.unit}`) },
          { header: t('reports.col.avgCost'), value: (r) => r.avg_cost ?? '' },
          { header: t('reports.col.price'), value: (r) => r.sell_price },
          { header: t('reports.col.valueCost'), value: (r) => r.stock_value_cost ?? '' },
          { header: t('reports.col.valueRetail'), value: (r) => r.stock_value_retail ?? '' },
          { header: t('reports.col.status'), value: (r) => t(`stock.${r.stock_status}`) },
        ]),
      };
    }
    const all: Expense[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await rpc('list_expenses', { p_filters: range, p_limit: 200, p_offset: offset });
      all.push(...page.items);
      if (all.length >= page.total_count || page.items.length === 0) break;
    }
    return {
      name: `expenses_${suffix}.csv`,
      rows: all.length,
      csv: toCsv(all, [
        { header: t('reports.col.date'), value: (r) => r.spent_on },
        { header: t('reports.col.category'), value: (r) => t(`expenseCategory.${r.category}`) },
        { header: t('reports.col.amount'), value: (r) => r.amount },
        { header: t('reports.col.note'), value: (r) => r.note },
      ]),
    };
  };

  const items: Array<{ key: ReportKey; icon: LucideIcon }> = [
    { key: 'sales', icon: Receipt },
    { key: 'products', icon: TrendingUp },
    { key: 'stock', icon: Boxes },
    { key: 'expenses', icon: Wallet },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />
      <PeriodPicker value={period} onChange={setPeriod} timeZone={tz} />
      <Section>
        <div className="space-y-3">
          {items.map(({ key, icon: Icon }) => (
            <Card key={key} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t(`reports.${key}.title`)}</p>
                <p className="text-xs text-hint">{t(`reports.${key}.body`)}</p>
              </div>
              <Button size="sm" variant="soft" icon={FileSpreadsheet} loading={busy === key} disabled={busy !== null} onClick={() => void run(key)}>
                CSV
              </Button>
            </Card>
          ))}
        </div>
      </Section>
      <Notice>{t('reports.telegramNote')}</Notice>
    </div>
  );
}
