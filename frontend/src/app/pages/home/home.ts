import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SideNav } from '../../shared/side-nav/side-nav';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, SideNav],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomePage {}
