export type JwtPayload = {
    sub?: string;
    role?: string;
    [key: string]: unknown;
};
