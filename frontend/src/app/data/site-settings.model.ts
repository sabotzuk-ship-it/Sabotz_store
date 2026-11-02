export interface StoreCategory {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  image: string;
  comingSoon: boolean;
  imageFile?: File;
  imagePreview?: string;
}

export interface SiteSettings {
  categories: StoreCategory[];
}

export const defaultSiteSettings: SiteSettings = {
  categories: [
    { id: 'shoes', name: 'Shoes', title: 'SHOES', subtitle: 'EXPLORE SNEAKERS', image: 'shoes.jpg', comingSoon: false },
    { id: 'clothing', name: 'Clothing', title: 'JACKETS & CLOTHING', subtitle: 'HOODIES. TRACKSUITS. T-SHIRTS.', image: 'clothing.jpg', comingSoon: true },
    { id: 'accessories', name: 'Accessories', title: 'ACCESSORIES', subtitle: 'SUNGLASSES. BAGS. MORE.', image: 'accessories.jpg', comingSoon: false }
  ]
};
