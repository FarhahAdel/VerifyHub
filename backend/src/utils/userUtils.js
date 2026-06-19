export const isWalletUser = (role)=> {
    return role.toUpperCase() === 'INSTITUTE' || role.toUpperCase() === 'STUDENT';
}