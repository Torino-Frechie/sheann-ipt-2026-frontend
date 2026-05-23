import { Role } from "./role";

export class Account {
    id?: string;
    title?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
    jwtToken?: string;
    dateCreated?: string;
    isVerified?: boolean;
}