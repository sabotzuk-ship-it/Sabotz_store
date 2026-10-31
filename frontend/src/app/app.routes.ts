import { Routes } from '@angular/router';
import { HomePage } from './pages/home/home';
import { ShoesPage } from './pages/shoes/shoes';
import { AdminPage } from './pages/admin/admin';
import { ProductPage } from './pages/product/product';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'SABOTZ | Clothing & Supply' },
  { path: 'shoes', component: ShoesPage, title: 'Shoes | SABOTZ Clothing & Supply' },
  { path: 'admin', component: AdminPage, title: 'Admin | SABOTZ' },
  { path: 'products/:slug', component: ProductPage, title: 'Product | SABOTZ' },
  { path: '**', redirectTo: '' }
];
