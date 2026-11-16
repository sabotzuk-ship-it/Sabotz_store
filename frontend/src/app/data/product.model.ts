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
