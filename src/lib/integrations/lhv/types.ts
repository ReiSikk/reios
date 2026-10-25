export type LhvAccountSummary = {
  id: string;
  name: string;
  currency: string;
  availableBalance: number;
};

export type LhvDashboardData =
  | {
      status: 'connected';
      accounts: LhvAccountSummary[];
      holdingsStatus: 'connected' | 'permission' | 'error';
      investmentValue: number | null;
      investmentCurrency: string | null;
      totalAssets: number | null;
    }
  | { status: 'unconfigured' | 'reconnect' | 'error' };
