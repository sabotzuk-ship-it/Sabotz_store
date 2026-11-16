export const ukShoeSizes = Array.from({ length: 13 }, (_, index) => String(5 + index / 2));

export interface Product {
  id: string;
  nome: string;
  marca: string;
  categoria: string;
  status: string;
  preco?: number;
  discountPercent?: number;
  fotos: string[];
  pagina: string;
}

export interface ProductCatalog {
  produtos: Product[];
}

export interface AdminProduct extends Product {
  sourcing?: {
    supplierUrl?: string;
    itemCost?: number;
    shippingCost?: number;
  };
}

export interface ProductPresentation {
  collection: string;
  description: string;
}
