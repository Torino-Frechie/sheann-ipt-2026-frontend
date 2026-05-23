import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { throwError, timeout, catchError } from 'rxjs';
import { finalize, first } from 'rxjs/operators';

import { AccountService, AlertService } from '@app/_services';

@Component({ templateUrl: 'list.component.html', standalone: false })
export class ListComponent implements OnInit {
    accounts: any[] = [];
    loading = false;

    constructor(
        private accountService: AccountService,
        private alertService: AlertService,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.loading = true;

        this.accountService.getAll()
            .pipe(
                first(),
                timeout(10000),
                catchError(err => {
                    const msg = err.name === 'TimeoutError' ? 'Request timed out' : err;
                    this.alertService.error(msg);
                    return throwError(() => err);
                }),
                finalize(() => {
                    this.loading = false;
                    this.cdr.detectChanges();
                })
            )
            .subscribe({
                next: accounts => {
                    this.accounts = accounts;
                    this.cdr.detectChanges();
                },
                error: error => {
                    this.accounts = [];
                }
            });
    }

    deleteAccount(id: string) {
        const account = this.accounts.find(x => x.id === id);
        if (!account) return;

        account.isDeleting = true;
        this.cdr.detectChanges();

        this.accountService.delete(id)
            .pipe(first())
            .subscribe(() => {
                this.accounts = this.accounts.filter(x => x.id !== id);
                this.cdr.detectChanges();
            });
    }
}