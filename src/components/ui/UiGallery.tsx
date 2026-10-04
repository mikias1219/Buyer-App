/* Dev-only component gallery (/#/ui). Not translated on purpose: it is never shipped (DEV-gated route). */
import { Heart, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ImageGallery,
  ImageUploader,
  Input,
  ListGroup,
  ListingCard,
  ListingCardSkeleton,
  ListingRow,
  ListingRowSkeleton,
  ListingStatusBadge,
  Notice,
  NumberInput,
  PaymentStatusBadge,
  PriceTag,
  RatingDisplay,
  RatingInput,
  Section,
  Select,
  Stat,
  Stepper,
  Tabs,
  Textarea,
  Toggle,
  VerifiedBadge,
  toast,
  ListItem,
} from './index';
import { LISTING_STATUSES } from '../../lib/api/types';
import { AppError } from '../../lib/api/errors';
import { mockImageDataUrl } from '../../lib/api/mock/seed';

export default function UiGallery() {
  const [sheet, setSheet] = useState(false);
  const [price, setPrice] = useState<number | null>(25000);
  const [toggle, setToggle] = useState(true);
  const [rating, setRating] = useState(4);
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const flip = () => {
    const html = document.documentElement;
    html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  };
  const img = mockImageDataUrl('mock/phone-3');
  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">UI gallery</h1>
        <Button size="sm" variant="secondary" onClick={flip}>
          Toggle dark
        </Button>
      </div>
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button icon={Plus}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash2}>
            Danger
          </Button>
          <Button variant="accent" icon={Sparkles}>
            Boost
          </Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <IconButton icon={Heart} label="Save" variant="surface" />
          <IconButton icon={Search} label="Search" variant="active" />
        </div>
      </Section>
      <Section title="Inputs">
        <Card className="space-y-3">
          <Input label="Title" placeholder="iPhone 13" maxLength={80} value="iPhone" onChange={() => {}} hint="Hint text" />
          <Input label="With error" value="" onChange={() => {}} error="This field is required" />
          <Select label="City" options={[{ value: 'a', label: 'Addis Ababa' }]} placeholder="Choose" />
          <Textarea label="Description" maxLength={200} value="Some text" onChange={() => {}} />
          <NumberInput label="Price" prefix="ETB" value={price} onChange={setPrice} />
          <Toggle label="Negotiable" description="Buyers can offer" checked={toggle} onChange={setToggle} />
        </Card>
      </Section>
      <Section title="Chips, badges, status">
        <div className="flex flex-wrap gap-2">
          <Chip selected>Selected</Chip>
          <Chip>Default</Chip>
          <Chip onRemove={() => {}} removeLabel="Remove">
            Removable
          </Chip>
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="accent" icon={Sparkles}>
            Featured
          </Badge>
          <VerifiedBadge withLabel />
          {LISTING_STATUSES.map((s) => (
            <ListingStatusBadge key={s} status={s} />
          ))}
          <PaymentStatusBadge status="submitted" />
        </div>
      </Section>
      <Section title="Tabs & stepper">
        <Tabs label="Demo" value={tab} onChange={setTab} items={[{ value: 'a', label: 'Live', count: 3 }, { value: 'b', label: 'Needs action', count: 2, attention: true }, { value: 'c', label: 'Drafts' }]} />
        <Stepper label="Progress" current={1} steps={['Photos', 'Details', 'Price', 'Review']} />
      </Section>
      <Section title="Listing">
        <div className="grid grid-cols-2 gap-3">
          <ListingCard
            item={{
              id: 'demo',
              title: 'iPhone 13 128GB Midnight',
              price: 52000,
              category: 'phone',
              brand: 'Apple',
              model: '',
              condition: 'like_new',
              city: 'Addis Ababa',
              negotiable: true,
              exchange: false,
              is_featured: true,
              published_at: new Date().toISOString(),
              cover_path: 'mock/phone-3',
              seller_verified: true,
            }}
          />
          <ListingCardSkeleton />
        </div>
        <ListingRow title="Galaxy S22" price={61000} coverPath="mock/phone-5" badge={<ListingStatusBadge status="active" />} meta="12 views" />
        <ListingRowSkeleton />
        <PriceTag value={25000} size="lg" />
        <RatingDisplay rating={4.6} count={12} size="md" />
        <RatingInput value={rating} onChange={setRating} />
        <ImageGallery urls={[img, mockImageDataUrl('mock/laptop-2')]} alt="demo" />
        <ImageUploader
          items={[
            { key: '1', url: img, status: 'done' },
            { key: '2', url: img, status: 'uploading' },
            { key: '3', url: img, status: 'error' },
          ]}
          onAdd={() => {}}
          onRemove={() => {}}
          onMove={() => {}}
          onMakeCover={() => {}}
          onRetry={() => {}}
        />
      </Section>
      <Section title="Feedback">
        <Notice tone="warning" title="Needs action">
          Pay the listing fee to publish.
        </Notice>
        <Notice tone="danger" title="Rejected">
          Photos are unclear.
        </Notice>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Revenue 7d" value="ETB 4,200" tone="success" />
          <Stat label="Waiting" value="2h" tone="danger" />
        </div>
        <ListGroup>
          <ListItem icon={Heart} label="Saved" to="/favorites" />
          <ListItem icon={Trash2} label="Danger" tone="danger" onClick={() => {}} />
        </ListGroup>
        <div className="flex gap-2">
          <Button onClick={() => toast.success('Saved')}>Toast</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Bottom sheet
          </Button>
          <Avatar name="Abebe" />
        </div>
        <EmptyState icon={Heart} title="Nothing saved yet" description="Tap the heart on a listing." />
        <ErrorState error={new AppError('network')} onRetry={() => {}} />
      </Section>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Bottom sheet" footer={<Button block onClick={() => setSheet(false)}>Done</Button>}>
        <p className="text-sm">Sheet content</p>
      </BottomSheet>
    </div>
  );
}
