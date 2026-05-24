import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, finalize } from 'rxjs/operators';

import { environment } from '@environments/environment';
import { Account } from '@app/_models';

const baseUrl = `${environment.apiUrl}/accounts`;

@Injectable({ providedIn: 'root' })
export class AccountService {
    private accountSubject: BehaviorSubject<Account | null>;
    public account: Observable<Account | null>;

    constructor(
        private router: Router,
        private http: HttpClient
    ) {
        this.accountSubject = new BehaviorSubject<Account | null>(null);
        this.account = this.accountSubject.asObservable();
    }

    public get accountValue() {
        return this.accountSubject.value;
    }

    login(email: string, password: string) {
        return this.http.post<any>(`${baseUrl}/authenticate`, { email, password }, { withCredentials: true })
            .pipe(map(account => {
                this.accountSubject.next(account);
                this.startRefreshTokenTimer();
                return account;
            }));
    }

    logout() {
        this.http.post<any>(`${baseUrl}/revoke-token`, {}, { withCredentials: true }).subscribe();
        this.stopRefreshTokenTimer();
        this.accountSubject.next(null);
        this.router.navigate(['/account/login']);
    }

    refreshToken() {
        return this.http.post<any>(`${baseUrl}/refresh-token`, {}, { withCredentials: true })
            .pipe(map((account) => {
                this.accountSubject.next(account);
                this.startRefreshTokenTimer();
                return account;
            }));
    }

    register(account: Account) {
        console.log('Sending registration request to real backend for:', account.email);
        return this.http.post(`${baseUrl}/register`, account, { withCredentials: true });
    }

    verifyEmail(token: string) {
        return this.http.post(`${baseUrl}/verify-email`, { token }, { withCredentials: true });
    }

    forgotPassword(email: string) {
        return this.http.post(`${baseUrl}/forgot-password`, { email }, { withCredentials: true });
    }

    validateResetToken(token: string) {
        return this.http.post(`${baseUrl}/validate-reset-token`, { token }, { withCredentials: true });
    }

    resetPassword(token: string, password: string, confirmPassword: string) {
        return this.http.post(`${baseUrl}/reset-password`, { token, password, confirmPassword }, { withCredentials: true });
    }

    getAll() {
        return this.http.get<Account[]>(baseUrl, { withCredentials: true });
    }

    getById(id: string) {
        return this.http.get<Account>(`${baseUrl}/${id}`, { withCredentials: true });
    }

    create(params: any) {
        return this.http.post(baseUrl, params, { withCredentials: true });
    }

    update(id: string, params: any) {
        return this.http.put(`${baseUrl}/${id}`, params, { withCredentials: true })
            .pipe(map((account: any) => {
                // update the current account if it was updated
                if (account.id === this.accountValue?.id) {
                    // publish updated account to subscribers
                    account = { ...this.accountValue, ...account };
                    this.accountSubject.next(account);
                }
                return account;
            }));
    }

    delete(id: string) {
        return this.http.delete(`${baseUrl}/${id}`, { withCredentials: true })
            .pipe(finalize(() => {
                // auto logout if the logged in account was deleted
                if (id === this.accountValue?.id)
                    this.logout();
            }));
    }

    // helper methods

    private refreshTokenTimeout?: any;

    private startRefreshTokenTimer() {
        if (!this.accountValue?.jwtToken) return;

        // parse json object from base64 encoded jwt token
        try {
            const parts = this.accountValue.jwtToken.split('.');
            if (parts.length !== 3) return;
            const jwtToken = JSON.parse(window.atob(parts[1]));

            // set a timeout to refresh the token a minute before it expires
            const expires = new Date(jwtToken.exp * 1000);
            const timeout = expires.getTime() - Date.now() - (60 * 1000);

            // Only start timer if the timeout is in the future
            if (timeout > 0) {
                this.refreshTokenTimeout = setTimeout(() => this.refreshToken().subscribe(), timeout);
            }
        } catch (e) {
            console.error('Error parsing JWT token for refresh timer:', e);
        }
    }

    private stopRefreshTokenTimer() {
        clearTimeout(this.refreshTokenTimeout);
    }
}