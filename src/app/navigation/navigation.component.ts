import { Component, OnInit } from '@angular/core';

import { YnabApiService } from '../ynab-api/ynab-api.service';
import { PrivacyPolicyService } from '../privacy-policy.service';

@Component({
  selector: 'app-navigation',
  templateUrl: 'navigation.component.html',
  standalone: false,
})
export class NavigationComponent implements OnInit {
  navbarClass: string = 'bg-light'; // Default to light theme
  buttonClass: string = 'btn-outline-dark'; // Default to dark color
  isOpen = false;
  isAuthorized = false;

  constructor(
    private ynabApiService: YnabApiService,
    private privacyPolicyService: PrivacyPolicyService
  ) {}

  ngOnInit() {
    const theme = document.documentElement.getAttribute('data-bs-theme');
    this.navbarClass = theme === 'dark' ? 'bg-dark' : 'bg-light';
    this.buttonClass =
      theme === 'dark' ? 'btn-outline-light' : 'btn-outline-dark';
    this.ynabApiService.isAuthorized$.subscribe({
      next: (isAuthorized) => (this.isAuthorized = isAuthorized),
    });
  }

  authorize() {
    this.ynabApiService.authorize();
  }

  logOut() {
    this.ynabApiService.clearToken();
    window.location.reload();
  }

  onPrivacyPolicyClick() {
    this.privacyPolicyService.expandPrivacyPolicy();
    
    // Give a moment for the collapse animation to complete, then scroll
    setTimeout(() => {
      const element = document.getElementById('privacy-policy');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
  }
}
