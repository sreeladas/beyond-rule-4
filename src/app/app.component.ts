import { Component, ViewEncapsulation, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { PrivacyPolicyService } from './privacy-policy.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  isPrivacyCollapsed = true;
  private subscription: Subscription;

  constructor(private privacyPolicyService: PrivacyPolicyService) {}

  ngOnInit() {
    this.subscription = this.privacyPolicyService.expandPrivacy$.subscribe(
      () => {
        this.isPrivacyCollapsed = false;
      }
    );
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
