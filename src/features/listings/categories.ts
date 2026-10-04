import { Headphones, Laptop, Monitor, Package, Plug, Smartphone, Tablet, Watch, type LucideIcon } from 'lucide-react';
import type { Category } from '../../lib/api/types';

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  phone: Smartphone,
  laptop: Laptop,
  tablet: Tablet,
  desktop: Monitor,
  watch: Watch,
  audio: Headphones,
  accessory: Plug,
  other: Package,
};
