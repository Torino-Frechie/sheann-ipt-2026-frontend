import { Injectable } from '@angular/core';
import { HttpRequest, HttpResponse, HttpHandler, HttpEvent, HttpInterceptor, HTTP_INTERCEPTORS } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { delay, materialize, dematerialize } from 'rxjs/operators';

import { AlertService } from '../_services/alert.service';
import { Role } from '../_models/role';

// array in local storage for accounts
const accountsKey = 'angular-15-signup-verification-boilerplate-accounts';
let accounts: any[] = JSON.parse(localStorage.getItem(accountsKey)!) || [];

@Injectable()
export class FakeBackendInterceptor implements HttpInterceptor {
    constructor(private alertService: AlertService) { }

    private sendResendEmail(to: string, subject: string, html: string) {
        // WARNING: Moving to real backend. Do not store API keys in frontend.
        const resendApiKey = 'REPLACED_BY_BACKEND_SERVER_KEY';

        return fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey.trim()}`
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev',
                to: to,
                subject: subject,
                html: html
            })
        })
        .then(async response => {
            if (!response.ok) {
                const errorData = await response.json();
                console.error('Resend API Error:', errorData);
            } else {
                console.log(`Email successfully sent to ${to}`);
            }
        })
        .catch(err => console.error('Resend Network Error:', err));
    }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const { url, method, headers, body } = request;
        const alertService = this.alertService;

        const handleRoute = () => {
            switch (true) {
                case url.endsWith('/accounts/authenticate') && method === 'POST':
                    return authenticate();
                case url.endsWith('/accounts/refresh-token') && method === 'POST':
                    return refreshToken();
                case url.endsWith('/accounts/revoke-token') && method === 'POST':
                    return revokeToken();
                case url.endsWith('/accounts/register') && method === 'POST':
                    return register();
                case url.endsWith('/accounts/verify-email') && method === 'POST':
                    return verifyEmail();
                case url.endsWith('/accounts/forgot-password') && method === 'POST':
                    return forgotPassword();
                case url.endsWith('/accounts/validate-reset-token') && method === 'POST':
                    return validateResetToken();
                case url.endsWith('/accounts/reset-password') && method === 'POST':
                    return resetPassword();
                case url.endsWith('/accounts') && method === 'GET':
                    return getAccounts();
                case url.match(/\/accounts\/[a-zA-Z0-9-]+$/) && method === 'GET':
                    return getAccountById();
                case url.endsWith('/accounts') && method === 'POST':
                    return createAccount();
                case url.match(/\/accounts\/[a-zA-Z0-9-]+$/) && method === 'PUT':
                    return updateAccount();
                case url.match(/\/accounts\/[a-zA-Z0-9-]+$/) && method === 'DELETE':
                    return deleteAccount();
                default:
                    // pass through any requests not handled above
                    return next.handle(request);
            }
        };

        // route functions

        const authenticate = () => {
            const { email, password } = body;
            const account = accounts.find(x => x.email === email && x.password === password);

            if (!account) return error('Email or password is incorrect');

            if (!account.isVerified) {
                return error('Account not verified. Please check your Gmail (frechieannt@gmail.com) for the verification link.');
            }

            // add refresh token to account
            if (!account.refreshTokens) account.refreshTokens = [];
            account.refreshTokens.push(generateRefreshToken());
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok({
                ...basicDetails(account),
                jwtToken: generateJwtToken(account)
            });
        };

        const refreshToken = () => {
            const refreshToken = getRefreshToken();

            if (!refreshToken) return unauthorized();

            const account = accounts.find(x => x.refreshTokens.includes(refreshToken));

            if (!account) return unauthorized();

            // replace old refresh token with a new one and save
            account.refreshTokens = account.refreshTokens.filter((x: any) => x !== refreshToken);
            account.refreshTokens.push(generateRefreshToken());
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok({
                ...basicDetails(account),
                jwtToken: generateJwtToken(account)
            });
        };

        const revokeToken = () => {
            if (!isAuthenticated()) return unauthorized();

            const refreshToken = getRefreshToken();
            const account = accounts.find(x => x.refreshTokens.includes(refreshToken));

            if (!account) return unauthorized();

            // revoke token and save
            account.refreshTokens = account.refreshTokens.filter((x: any) => x !== refreshToken);
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok();
        };

        const register = () => {
            const account = body;

            if (!account) return error('Account data is required');

            if (accounts.find(x => x.email === account.email)) {
                const existingAccount = accounts.find(x => x.email === account.email);
                // Re-send verification email to help testing
                sendVerificationEmail(existingAccount);

                setTimeout(() => {
                    alertService.warn(`
                        <h4>Email Already Registered</h4>
                        <p>Your email ${account.email} is already registered.</p>
                        <p>A new verification link has been sent to <strong>frechieannt@gmail.com</strong> for your testing.</p>
                    `, { autoClose: false });
                }, 1000);

                return ok();
            }

            // assign account id and a few other properties then save
            account.id = generateUuid();
            if (accounts.length === 0) {
                // first registered account is an admin
                account.role = Role.Admin;
            } else {
                account.role = Role.User;
            }
            account.dateCreated = new Date().toISOString();
            account.verificationToken = new Date().getTime().toString();
            account.isVerified = false;
            account.refreshTokens = [];
            delete account.confirmPassword;
            accounts.push(account);
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            // send verification email via Resend
            sendVerificationEmail(account);

            return ok();
        };

        const sendVerificationEmail = (account: any) => {
            setTimeout(() => {
                const verifyUrl = `${location.origin}/account/verify-email?token=${account.verificationToken}`;
                this.sendResendEmail('frechieannt@gmail.com', 'Verify Your Email Address', `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                        <h2 style="color: #333; text-align: center;">Confirm your registration</h2>
                        <p>Hi ${account.firstName},</p>
                        <p>To complete your sign-up for <strong>${account.email}</strong>, please click the button below:</p>
                        <div style="text-align: center; margin: 35px 0;">
                            <a href="${verifyUrl}" style="background-color: #2ecc71; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify My Email</a>
                        </div>
                        <p style="font-size: 14px; color: #999;">If the button doesn't work, use this link: <br> ${verifyUrl}</p>
                        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 30px 0;">
                        <p style="font-size: 11px; color: #bdc3c7; text-align: center;">Testing environment verification link</p>
                    </div>
                `);
            }, 1000);
        };

        const verifyEmail = () => {
            const { token } = body;
            const account = accounts.find(x => !!x.verificationToken && x.verificationToken === token);

            if (!account) return error('Verification failed');

            // set is verified flag to true if token is valid
            account.isVerified = true;
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok();
        };

        const forgotPassword = () => {
            const { email } = body;
            const account = accounts.find(x => x.email === email);

            // always return ok() response to prevent email enumeration
            if (!account) {
                setTimeout(() => {
                    alertService.warn(`
                        <h4>Email Not Found</h4>
                        <p>The email ${email} is not registered in this browser's session.</p>
                    `, { autoClose: false });
                }, 1000);
                return ok();
            }

            // create reset token that expires after 24 hours
            account.resetToken = new Date().getTime().toString();
            account.resetTokenExpires = new Date(Date.now() + 24*60*60*1000).toISOString();
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            // send password reset email via Resend
            setTimeout(() => {
                const resetUrl = `${location.origin}/account/reset-password?token=${account.resetToken}`;
                // Hardcode to your email because Resend sandbox only allows sending to the account owner
                this.sendResendEmail('frechieannt@gmail.com', 'Securely Reset Your Password', `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #f0f0f0; border-radius: 12px; background-color: #ffffff;">
                        <h2 style="color: #2c3e50; text-align: center; font-size: 24px;">Password Reset Request</h2>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">Hello,</p>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">We received a request to reset your account password. Click the button below to proceed. For your security, this link is only valid for 24 hours.</p>
                        <div style="text-align: center; margin: 35px 0;">
                            <a href="${resetUrl}" style="background-color: #3498db; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">Reset Password</a>
                        </div>
                        <p style="color: #555; font-size: 16px; line-height: 1.6;">If you didn't request this change, you can safely ignore this email; your account is still secure.</p>
                        <p style="color: #999; font-size: 14px; line-height: 1.6;">If the button above doesn't work, copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #3498db; font-size: 14px;">${resetUrl}</p>
                        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 30px 0;">
                        <p style="font-size: 12px; color: #bdc3c7; text-align: center;">
                            &copy; 2026 Your Deployed App. All rights reserved.
                        </p>
                    </div>
                `);
            }, 1000);

            return ok();
        };

        const validateResetToken = () => {
            const { token } = body;
            const account = accounts.find(x =>
                !!x.resetToken && x.resetToken === token &&
                new Date() < new Date(x.resetTokenExpires)
            );

            if (!account) return error('Invalid token');

            return ok();
        };

        const resetPassword = () => {
            const { token, password } = body;
            const account = accounts.find(x =>
                !!x.resetToken && x.resetToken === token &&
                new Date() < new Date(x.resetTokenExpires)
            );

            if (!account) return error('Invalid token');

            // update password and remove reset token
            account.password = password;
            account.isVerified = true;
            delete account.resetToken;
            delete account.resetTokenExpires;

            // add refresh token to account to enable immediate login
            if (!account.refreshTokens) account.refreshTokens = [];
            account.refreshTokens.push(generateRefreshToken());
            
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            // return user details and jwt token to facilitate auto-login
            return ok({
                ...basicDetails(account),
                jwtToken: generateJwtToken(account)
            });
        };

        const getAccounts = () => {
            if (!isAuthenticated()) return unauthorized();
            return ok(accounts.map(x => basicDetails(x)));
        };

        const getAccountById = () => {
            if (!isAuthenticated()) return unauthorized();

            let account = accounts.find(x => x.id === idFromUrl());

            if (!account) return error('Account not found');

            // user accounts can get own profile and admin accounts can get all profiles
            const currentUser = currentAccount();
            if (!currentUser || (account.id !== currentUser.id && !isAuthorized(Role.Admin))) {
                return unauthorized();
            }

            return ok(basicDetails(account));
        };

        const createAccount = () => {
            if (!isAuthorized(Role.Admin)) return unauthorized();

            const account = body;
            if (accounts.find(x => x.email === account.email)) {
                return error(`Email ${account.email} is already registered`);
            }

            // assign account id and a few other properties then save
            account.id = generateUuid();
            account.dateCreated = new Date().toISOString();
            account.isVerified = true;
            account.refreshTokens = [];
            delete account.confirmPassword;
            accounts.push(account);
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok();
        };

        const updateAccount = () => {
            if (!isAuthenticated()) return unauthorized();

            let params = body;
            let account = accounts.find(x => x.id === idFromUrl());

            if (!account) return error('Account not found');

            // user accounts can update own profile and admin accounts can update all profiles
            const currentUser = currentAccount();
            if (!currentUser || (account.id !== currentUser.id && !isAuthorized(Role.Admin))) {
                return unauthorized();
            }

            // only update password if included
            if (!params.password) {
                delete params.password;
            }
            // don't save confirm password
            delete params.confirmPassword;

            // update and save account
            Object.assign(account, params);
            localStorage.setItem(accountsKey, JSON.stringify(accounts));

            return ok(basicDetails(account));
        };

        const deleteAccount = () => {
            if (!isAuthenticated()) return unauthorized();

            let account = accounts.find(x => x.id === idFromUrl());

            if (!account) return error('Account not found');

            // user accounts can delete own account and admin accounts can delete any account
            const currentUser = currentAccount();
            if (!currentUser || (account.id !== currentUser.id && !isAuthorized(Role.Admin))) {
                return unauthorized();
            }

            // delete account then save
            accounts = accounts.filter(x => x.id !== idFromUrl());
            localStorage.setItem(accountsKey, JSON.stringify(accounts));
            return ok();
        };

        // helper functions

        const ok = (body?: any) => {
            return of(new HttpResponse({ status: 200, body }))
                .pipe(delay(500)); // delay observable to simulate server api call
        };

        const error = (message: string) => {
            return throwError(() => ({ error: { message } }))
                .pipe(materialize(), delay(500), dematerialize());
        };

        const unauthorized = () => {
            return throwError(() => ({ status: 401, error: { message: 'Unauthorized' } }))
                .pipe(materialize(), delay(500), dematerialize());
        };

        const basicDetails = (account: any) => {
            const { id, title, firstName, lastName, email, role, dateCreated, isVerified } = account;
            return { id, title, firstName, lastName, email, role, dateCreated, isVerified };
        };

        const isAuthenticated = () => {
            return !!currentAccount();
        };

        const isAuthorized = (role: any) => {
            const account = currentAccount();
            if (!account) return false;
            return account.role === role;
        };

        const idFromUrl = () => {
            const urlParts = url.split('/');
            return urlParts[urlParts.length - 1];
        };

        const generateUuid = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };

        const currentAccount = () => {
            // check if jwt token is in auth header
            const authHeader = headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer fake-jwt-token')) return;

            // check if token is expired
            const jwtToken = JSON.parse(atob(authHeader.split('.')[1]));
            const tokenExpired = Date.now() > (jwtToken.exp * 1000);
            if (tokenExpired) return;

            const account = accounts.find(x => x.id === jwtToken.id);
            return account;
        };

        const generateJwtToken = (account: any) => {
            // create token that expires in 15 minutes
            const tokenPayload = {
                exp: Math.round(new Date(Date.now() + 15*60*1000).getTime() / 1000),
                id: account.id
            }
            return `fake-jwt-token.${btoa(JSON.stringify(tokenPayload))}`;
        };

        const generateRefreshToken = () => {
            const token = new Date().getTime().toString();

            // add token cookie that expires in 7 days
            const expires = new Date(Date.now() + 7*24*60*60*1000).toUTCString();
            document.cookie = `fakeRefreshToken=${token}; expires=${expires}; path=/`;

            return token;
        };

        const getRefreshToken = () => {
            // get refresh token from cookie
            return (document.cookie.split(';').find(x => x.includes('fakeRefreshToken')) || '=').split('=')[1];
        };

        return handleRoute();
    }
}

export let fakeBackendProvider = {
    // use fake backend in place of Http service for backend-less development
    provide: HTTP_INTERCEPTORS,
    useClass: FakeBackendInterceptor,
    multi: true
};