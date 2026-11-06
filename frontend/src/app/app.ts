import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InteractionFeedback } from './shared/interaction-feedback/interaction-feedback';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  hostDirectives: [InteractionFeedback],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
}
