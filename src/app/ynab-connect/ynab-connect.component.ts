import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { YnabApiService } from '../ynab-api/ynab-api.service';

@Component({
  selector: 'app-ynab-connect',
  templateUrl: 'ynab-connect.component.html',
  standalone: false,
})
export class YnabConnectComponent implements OnInit {
  constructor(private ynabApiService: YnabApiService, private router: Router) {}

  ngOnInit() {
    if (this.ynabApiService.findYnabToken()) {
      this.router.navigate(['/forecasting']);
    }
  }

  authorize() {
    this.ynabApiService.authorize();
  }
}
