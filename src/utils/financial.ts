// Financial utilities stub
export function calculateInstallments(...args: any[]): any {
  return { installments: [], totalAmount: 0 };
}

export function formatCurrency(value: number): string {
  return 'R$ ' + value.toFixed(2);
}

export class FinancialUtils {
  static calculateInstallments = calculateInstallments;
  static formatCurrency = formatCurrency;
}

export class DateUtils {
  static format(date: Date): string {
    return date.toISOString();
  }
  static addMonths(date: Date, months: number): Date {
    return new Date(date.setMonth(date.getMonth() + months));
  }
}
