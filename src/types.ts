export type ProductType = 'Playbook' | 'System' | 'Tool' | 'Template' | 'Bundle';

export interface MediaItem {
  url: string;
  type?: 'image' | 'video';
  alt?: string;
}

export interface Product {
  id: number | string;
  name: string;
  category: string;
  price: string;
  desc?: string;
  tags?: string[];
  includes?: string[];
  badge?: string;
  ptype?: ProductType | string;
  media?: MediaItem[];
  imageUrl?: string;
  origPrice?: string;
  sold?: string;
  active?: boolean;
  checkoutReady?: boolean;
}

export interface WallItem {
  id?: string;
  url: string;
  alt?: string;
}

export interface StoreContent {
  logo?: string;
  pill?: string;
  eyebrow?: string;
  title?: string;
  sub?: string;
  announce?: string;
  allLabel?: string;
  strip?: string[];
  flogo?: string;
  fcopy?: string;
  confh?: string;
  confp?: string;
  confsteps?: string[];
  systemsSub?: string;
  wallSub?: string;
}

export interface PublicStore {
  products: Product[];
  gallery: WallItem[];
  content: StoreContent;
  contactEmail: string;
}

export type PublicRoute = 'home' | 'systems' | 'wall' | 'product' | 'success' | 'admin' | 'not-found';
