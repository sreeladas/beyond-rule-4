import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PrivacyPolicyService {
  private expandPrivacySubject = new Subject<void>();

  expandPrivacy$ = this.expandPrivacySubject.asObservable();

  expandPrivacyPolicy() {
    this.expandPrivacySubject.next();
  }
}
