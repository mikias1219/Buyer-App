/* Dev-only component gallery (/#/ui). Not translated on purpose: it is never shipped (DEV-gated route). */
import { Banknote, Package, Plus, Search, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import type { Period } from '../../lib/period';
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  FilterGroup,
  FilterSheet,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  Notice,
  NumberInput,
  PeriodPicker,
  Quantity,
  Section,
  StatCard,
  StatGridSkeleton,
  StockBadge,
  Tabs,
  Toggle,
  toast,
} from './index';

export default function UiGallery() {
  const [period, setPeriod] = useState<Period>({ preset: 'today' });
  const [sheet, setSheet] = useState(false);
  const [filters, setFilters] = useState(false);
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [num, setNum] = useState<number | null>(25000);
  const [on, setOn] = useState(true);

  return (
    <div className="space-y-6">
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
        </div>
      </Section>
      <Section title="Period">
        <PeriodPicker value={period} onChange={setPeriod} timeZone="Africa/Addis_Ababa" />
      </Section>
      <Section title="Stats">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Revenue" icon={Banknote} value={<Money value={9455} />} delta={12.5} />
          <StatCard label="Net profit" icon={TrendingUp} value={<Money value={-230} tone="auto" />} delta={-40} />
          <StatCard label="Expenses" icon={Wallet} value={<Money value={300} />} delta={10} invert />
          <StatCard label="Stock value" icon={Package} value={<Money value={19943.75} />} hint="at cost" />
        </div>
        <StatGridSkeleton count={2} />
      </Section>
      <Section title="Rows">
        <ListGroup>
          <ListRow title="Tecno Spark 20" subtitle="Phones · TEC-SP20" trailing={<Money value={9000} />} meta={<StockBadge status="low" />} to="/ui" />
          <ListRow title="Copper wire" subtitle={<Quantity value={180.5} unit="metre" />} trailing={<Money value={40.5} />} meta={<StockBadge status="ok" />} />
          <ListRow title="Nokia 105" subtitle={<Quantity value={0} unit="piece" />} trailing={<Money value={1800} />} meta={<StockBadge status="out" />} onClick={() => toast.info('Tapped')} />
        </ListGroup>
        <ListSkeleton rows={2} />
      </Section>
      <Section title="Inputs">
        <Input label="Search" leading={<Search className="size-5" />} placeholder="Name or SKU" />
        <NumberInput label="Price" prefix="ETB" value={num} onChange={setNum} />
        <Toggle checked={on} onChange={setOn} label="Allow negative stock" />
      </Section>
      <Section title="Chips, badges, tabs">
        <div className="flex flex-wrap gap-2">
          <Chip selected>Selected</Chip>
          <Chip>Plain</Chip>
          <Chip onRemove={() => undefined} removeLabel="Remove">Removable</Chip>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="accent">Accent</Badge>
        </div>
        <Tabs items={[{ value: 'a', label: 'All', count: 3 }, { value: 'b', label: 'Low', count: 2, attention: true }]} value={tab} onChange={setTab} label="Tabs" />
      </Section>
      <Section title="Feedback">
        <Notice title="Notice">Something you should know.</Notice>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSheet(true)}>Sheet</Button>
          <Button variant="secondary" onClick={() => setFilters(true)}>Filters</Button>
          <Button variant="secondary" onClick={() => toast.success('Saved')}>Toast</Button>
        </div>
        <EmptyState icon={Package} title="No products yet" description="Add your first product." />
        <ErrorState error={new Error('network')} onRetry={() => undefined} />
      </Section>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Bottom sheet">
        <p className="text-sm">Content</p>
      </BottomSheet>
      <FilterSheet open={filters} onClose={() => setFilters(false)} onApply={() => undefined} onReset={() => undefined}>
        <FilterGroup label="Stock">
          <Chip selected>All</Chip>
          <Chip>Low</Chip>
          <Chip>Out</Chip>
        </FilterGroup>
      </FilterSheet>
    </div>
  );
}
