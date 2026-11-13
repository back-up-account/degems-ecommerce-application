export type BankTransferDetails = {
  bankName: string;
  accountName: string;
  accountNumber: string;
};

export class BankTransferConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankTransferConfigError';
  }
}

export function getBankTransferDetails(): BankTransferDetails | null {
  const bankName = process.env.DEGEMS_BANK_NAME?.trim() ?? '';
  const accountName = process.env.DEGEMS_BANK_ACCOUNT_NAME?.trim() ?? '';
  const accountNumber = process.env.DEGEMS_BANK_ACCOUNT_NUMBER?.trim() ?? '';

  if (!bankName && !accountName && !accountNumber) return null;
  if (!bankName || !accountName || !/^\d{10}$/.test(accountNumber)) {
    throw new BankTransferConfigError('Configure the bank name, account name, and a 10-digit account number.');
  }

  return { bankName, accountName, accountNumber };
}
