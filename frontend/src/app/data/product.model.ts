export interface Product {
  id: string;
  nome: string;
  marca: string;
  categoria: string;
  status: string;
  preco?: number;
  fotos: string[];
  pagina: string;
}

export interface ProductCatalog {
  produtos: Product[];
}

export interface ProductPresentation {
  collection: string;
  description: string;
}
